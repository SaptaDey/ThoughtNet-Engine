
import * as os from 'os';
import * as fs from 'fs';
import { promisify } from 'util';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

interface ResourceLimits {
  maxMemoryUsagePercent: number;
  maxCpuLoadAverage: number;
  maxActiveConnections: number;
  maxDiskUsagePercent?: number;
  maxOpenFileDescriptors?: number;
  maxNetworkConnections?: number;
}

interface DetailedResourceStatus {
  memoryUsagePercent: number;
  cpuLoadAverage: number;
  freeMemoryMB: number;
  activeConnections: number;
  diskUsagePercent: number;
  openFileDescriptors: number;
  networkConnections: number;
  systemUptime: number;
  processUptime: number;
  cpuUsagePercent: number;
  heapUsedMB: number;
  heapTotalMB: number;
  withinLimits: boolean;
  resourcePressure: 'low' | 'medium' | 'high' | 'critical';
}

interface PerformanceMetrics {
  avgResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  memoryLeakDetected: boolean;
  gcPressure: number;
}

interface AlertThreshold {
  metric: keyof DetailedResourceStatus;
  threshold: number;
  severity: 'warning' | 'critical';
  action?: () => void;
}

export class ResourceMonitor {
  private limits: ResourceLimits;
  private activeConnections: number = 0;
  private performanceHistory: PerformanceMetrics[] = [];
  private alertThresholds: AlertThreshold[] = [];
  private lastCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
  private lastCpuCheck: number = Date.now();
  private requestMetrics: { timestamp: number; responseTime: number; error: boolean }[] = [];

  constructor(limits?: Partial<ResourceLimits>) {
    this.limits = {
      maxMemoryUsagePercent: limits?.maxMemoryUsagePercent || 80,
      maxCpuLoadAverage: limits?.maxCpuLoadAverage || 0.8,
      maxActiveConnections: limits?.maxActiveConnections || 100,
      maxDiskUsagePercent: limits?.maxDiskUsagePercent || 90,
      maxOpenFileDescriptors: limits?.maxOpenFileDescriptors || 1000,
      maxNetworkConnections: limits?.maxNetworkConnections || 500,
    };

    this.setupDefaultAlerts();
    this.startPeriodicMonitoring();
  }

  private setupDefaultAlerts(): void {
    this.alertThresholds = [
      {
        metric: 'memoryUsagePercent',
        threshold: 85,
        severity: 'warning',
        action: () => logger.warn('High memory usage detected')
      },
      {
        metric: 'memoryUsagePercent',
        threshold: 95,
        severity: 'critical',
        action: () => logger.error('Critical memory usage - consider scaling or restarting')
      },
      {
        metric: 'cpuLoadAverage',
        threshold: 0.9,
        severity: 'warning',
        action: () => logger.warn('High CPU load detected')
      },
      {
        metric: 'diskUsagePercent',
        threshold: 85,
        severity: 'warning',
        action: () => logger.warn('High disk usage detected')
      }
    ];
  }

  private startPeriodicMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(async () => {
      try {
        const status = await this.getDetailedResourceStatus();
        this.checkAlerts(status);
        this.performanceHistory.push(await this.getPerformanceMetrics());
        
        // Keep only last 100 entries (50 minutes of history)
        if (this.performanceHistory.length > 100) {
          this.performanceHistory = this.performanceHistory.slice(-100);
        }
      } catch (error) {
        logger.error('Error in periodic monitoring:', error);
      }
    }, 30000);

    // Clean up old request metrics every minute
    setInterval(() => {
      const oneHourAgo = Date.now() - 3600000;
      this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > oneHourAgo);
    }, 60000);
  }

  incrementConnections(): void {
    this.activeConnections++;
  }

  decrementConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  recordRequest(responseTime: number, error: boolean = false): void {
    this.requestMetrics.push({
      timestamp: Date.now(),
      responseTime,
      error
    });
  }

  async checkResources(): Promise<boolean> {
    const status = await this.getDetailedResourceStatus();
    return status.withinLimits;
  }

  async getResourceStatus(): Promise<DetailedResourceStatus> {
    return this.getDetailedResourceStatus();
  }

  async getDetailedResourceStatus(): Promise<DetailedResourceStatus> {
    // Memory monitoring
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    const freeMemoryMB = Math.round(freeMemory / (1024 * 1024));

    // Process memory
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
    const heapTotalMB = Math.round(memUsage.heapTotal / (1024 * 1024));

    // CPU monitoring
    const loadAvg = os.loadavg();
    const cpuLoadAverage = loadAvg[0];
    const cpuCount = os.cpus().length;
    const normalizedCpuLoad = cpuLoadAverage / cpuCount;

    // Process CPU usage
    const cpuUsagePercent = await this.getCpuUsagePercent();

    // Disk usage
    const diskUsagePercent = await this.getDiskUsage();

    // File descriptors
    const openFileDescriptors = await this.getOpenFileDescriptors();

    // Network connections
    const networkConnections = await this.getNetworkConnections();

    // System info
    const systemUptime = os.uptime();
    const processUptime = process.uptime();

    // Check limits
    const memoryOk = memoryUsagePercent <= this.limits.maxMemoryUsagePercent;
    const cpuOk = normalizedCpuLoad <= this.limits.maxCpuLoadAverage;
    const connectionsOk = this.activeConnections <= this.limits.maxActiveConnections;
    const diskOk = !this.limits.maxDiskUsagePercent || diskUsagePercent <= this.limits.maxDiskUsagePercent;
    const fileDescriptorsOk = !this.limits.maxOpenFileDescriptors || openFileDescriptors <= this.limits.maxOpenFileDescriptors;
    const networkOk = !this.limits.maxNetworkConnections || networkConnections <= this.limits.maxNetworkConnections;

    const withinLimits = memoryOk && cpuOk && connectionsOk && diskOk && fileDescriptorsOk && networkOk;

    // Calculate resource pressure
    const resourcePressure = this.calculateResourcePressure(
      memoryUsagePercent,
      normalizedCpuLoad * 100,
      diskUsagePercent
    );

    return {
      memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
      cpuLoadAverage: Math.round(normalizedCpuLoad * 100) / 100,
      freeMemoryMB,
      activeConnections: this.activeConnections,
      diskUsagePercent,
      openFileDescriptors,
      networkConnections,
      systemUptime: Math.round(systemUptime),
      processUptime: Math.round(processUptime),
      cpuUsagePercent,
      heapUsedMB,
      heapTotalMB,
      withinLimits,
      resourcePressure
    };
  }

  private calculateResourcePressure(memory: number, cpu: number, disk: number): 'low' | 'medium' | 'high' | 'critical' {
    const maxUsage = Math.max(memory, cpu, disk);
    
    if (maxUsage >= 95) return 'critical';
    if (maxUsage >= 80) return 'high';
    if (maxUsage >= 60) return 'medium';
    return 'low';
  }

  private async getCpuUsagePercent(): Promise<number> {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastCpuCheck;

    if (timeDiff > 0) {
      const totalUsage = currentUsage.user + currentUsage.system;
      const cpuPercent = (totalUsage / (timeDiff * 1000)) * 100;
      
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuCheck = currentTime;
      
      return Math.round(Math.min(100, cpuPercent) * 100) / 100;
    }
    
    return 0;
  }

  private async getDiskUsage(): Promise<number> {
    try {
      if (process.platform === 'win32') {
        // Windows implementation would require different approach
        return 0;
      }

      const stats = await promisify(fs.statfs || fs.stat)('/');
      if ('bavail' in stats && 'blocks' in stats) {
        const total = (stats as any).blocks * (stats as any).frsize;
        const available = (stats as any).bavail * (stats as any).frsize;
        const used = total - available;
        return Math.round((used / total) * 100 * 100) / 100;
      }
    } catch (error) {
      logger.debug('Could not get disk usage:', error);
    }
    return 0;
  }

  private async getOpenFileDescriptors(): Promise<number> {
    try {
      if (process.platform === 'linux') {
        const fdDir = `/proc/${process.pid}/fd`;
        const files = await promisify(fs.readdir)(fdDir);
        return files.length;
      }
    } catch (error) {
      logger.debug('Could not get file descriptor count:', error);
    }
    return 0;
  }

  private async getNetworkConnections(): Promise<number> {
    try {
      if (process.platform === 'linux') {
        const netstat = await promisify(fs.readFile)('/proc/net/tcp', 'utf8');
        return netstat.split('\n').length - 2; // Subtract header and empty line
      }
    } catch (error) {
      logger.debug('Could not get network connection count:', error);
    }
    return 0;
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const recentRequests = this.requestMetrics.filter(r => r.timestamp > Date.now() - 60000); // Last minute
    
    const avgResponseTime = recentRequests.length > 0 
      ? recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / recentRequests.length
      : 0;
    
    const requestsPerSecond = recentRequests.length / 60;
    const errorRate = recentRequests.length > 0 
      ? recentRequests.filter(r => r.error).length / recentRequests.length
      : 0;

    // Simple memory leak detection
    const memoryLeakDetected = this.detectMemoryLeak();
    
    // GC pressure estimation
    const gcPressure = this.estimateGcPressure();

    return {
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      memoryLeakDetected,
      gcPressure
    };
  }

  private detectMemoryLeak(): boolean {
    if (this.performanceHistory.length < 10) return false;
    
    const recent = this.performanceHistory.slice(-10);
    const memoryTrend = recent.every((current, index) => {
      if (index === 0) return true;
      const previous = recent[index - 1];
      return current.gcPressure > previous.gcPressure;
    });
    
    return memoryTrend;
  }

  private estimateGcPressure(): number {
    const memUsage = process.memoryUsage();
    const heapRatio = memUsage.heapUsed / memUsage.heapTotal;
    return Math.round(heapRatio * 100 * 100) / 100;
  }

  private checkAlerts(status: DetailedResourceStatus): void {
    this.alertThresholds.forEach(alert => {
      const value = status[alert.metric] as number;
      if (value >= alert.threshold && alert.action) {
        alert.action();
      }
    });
  }

  async waitForResources(maxWaitMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      if (await this.checkResources()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  getResourceHistory(): PerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  addCustomAlert(alert: AlertThreshold): void {
    this.alertThresholds.push(alert);
  }

  async getHealthSummary(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    resources: DetailedResourceStatus;
    performance: PerformanceMetrics;
    uptime: number;
  }> {
    const resources = await this.getDetailedResourceStatus();
    const performance = await this.getPerformanceMetrics();
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (resources.resourcePressure === 'critical' || !resources.withinLimits) {
      status = 'unhealthy';
    } else if (resources.resourcePressure === 'high' || performance.errorRate > 0.05) {
      status = 'degraded';
    }

    return {
      status,
      resources,
      performance,
      uptime: process.uptime()
    };
  }
}
