"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceMonitor = void 0;
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const util_1 = require("util");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console()
    ]
});
class ResourceMonitor {
    constructor(limits) {
        this.activeConnections = 0;
        this.performanceHistory = [];
        this.alertThresholds = [];
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuCheck = Date.now();
        this.requestMetrics = [];
        this.limits = {
            maxMemoryUsagePercent: (limits === null || limits === void 0 ? void 0 : limits.maxMemoryUsagePercent) || 80,
            maxCpuLoadAverage: (limits === null || limits === void 0 ? void 0 : limits.maxCpuLoadAverage) || 0.8,
            maxActiveConnections: (limits === null || limits === void 0 ? void 0 : limits.maxActiveConnections) || 100,
            maxDiskUsagePercent: (limits === null || limits === void 0 ? void 0 : limits.maxDiskUsagePercent) || 90,
            maxOpenFileDescriptors: (limits === null || limits === void 0 ? void 0 : limits.maxOpenFileDescriptors) || 1000,
            maxNetworkConnections: (limits === null || limits === void 0 ? void 0 : limits.maxNetworkConnections) || 500,
        };
        this.setupDefaultAlerts();
        this.startPeriodicMonitoring();
    }
    setupDefaultAlerts() {
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
    startPeriodicMonitoring() {
        // Monitor every 30 seconds
        setInterval(() => __awaiter(this, void 0, void 0, function* () {
            try {
                const status = yield this.getDetailedResourceStatus();
                this.checkAlerts(status);
                this.performanceHistory.push(yield this.getPerformanceMetrics());
                // Keep only last 100 entries (50 minutes of history)
                if (this.performanceHistory.length > 100) {
                    this.performanceHistory = this.performanceHistory.slice(-100);
                }
            }
            catch (error) {
                logger.error('Error in periodic monitoring:', error);
            }
        }), 30000);
        // Clean up old request metrics every minute
        setInterval(() => {
            const oneHourAgo = Date.now() - 3600000;
            this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > oneHourAgo);
        }, 60000);
    }
    incrementConnections() {
        this.activeConnections++;
    }
    decrementConnections() {
        this.activeConnections = Math.max(0, this.activeConnections - 1);
    }
    recordRequest(responseTime, error = false) {
        this.requestMetrics.push({
            timestamp: Date.now(),
            responseTime,
            error
        });
    }
    checkResources() {
        return __awaiter(this, void 0, void 0, function* () {
            const status = yield this.getDetailedResourceStatus();
            return status.withinLimits;
        });
    }
    getResourceStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getDetailedResourceStatus();
        });
    }
    getDetailedResourceStatus() {
        return __awaiter(this, void 0, void 0, function* () {
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
            const cpuUsagePercent = yield this.getCpuUsagePercent();
            // Disk usage
            const diskUsagePercent = yield this.getDiskUsage();
            // File descriptors
            const openFileDescriptors = yield this.getOpenFileDescriptors();
            // Network connections
            const networkConnections = yield this.getNetworkConnections();
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
            const resourcePressure = this.calculateResourcePressure(memoryUsagePercent, normalizedCpuLoad * 100, diskUsagePercent);
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
        });
    }
    calculateResourcePressure(memory, cpu, disk) {
        const maxUsage = Math.max(memory, cpu, disk);
        if (maxUsage >= 95)
            return 'critical';
        if (maxUsage >= 80)
            return 'high';
        if (maxUsage >= 60)
            return 'medium';
        return 'low';
    }
    getCpuUsagePercent() {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    getDiskUsage() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (process.platform === 'win32') {
                    // Windows implementation would require different approach
                    return 0;
                }
                const stats = yield (0, util_1.promisify)(fs.statfs || fs.stat)('/');
                if ('bavail' in stats && 'blocks' in stats) {
                    const total = stats.blocks * stats.frsize;
                    const available = stats.bavail * stats.frsize;
                    const used = total - available;
                    return Math.round((used / total) * 100 * 100) / 100;
                }
            }
            catch (error) {
                logger.debug('Could not get disk usage:', error);
            }
            return 0;
        });
    }
    getOpenFileDescriptors() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (process.platform === 'linux') {
                    const fdDir = `/proc/${process.pid}/fd`;
                    const files = yield (0, util_1.promisify)(fs.readdir)(fdDir);
                    return files.length;
                }
            }
            catch (error) {
                logger.debug('Could not get file descriptor count:', error);
            }
            return 0;
        });
    }
    getNetworkConnections() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (process.platform === 'linux') {
                    const netstat = yield (0, util_1.promisify)(fs.readFile)('/proc/net/tcp', 'utf8');
                    return netstat.split('\n').length - 2; // Subtract header and empty line
                }
            }
            catch (error) {
                logger.debug('Could not get network connection count:', error);
            }
            return 0;
        });
    }
    getPerformanceMetrics() {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    detectMemoryLeak() {
        if (this.performanceHistory.length < 10)
            return false;
        const recent = this.performanceHistory.slice(-10);
        const memoryTrend = recent.every((current, index) => {
            if (index === 0)
                return true;
            const previous = recent[index - 1];
            return current.gcPressure > previous.gcPressure;
        });
        return memoryTrend;
    }
    estimateGcPressure() {
        const memUsage = process.memoryUsage();
        const heapRatio = memUsage.heapUsed / memUsage.heapTotal;
        return Math.round(heapRatio * 100 * 100) / 100;
    }
    checkAlerts(status) {
        this.alertThresholds.forEach(alert => {
            const value = status[alert.metric];
            if (value >= alert.threshold && alert.action) {
                alert.action();
            }
        });
    }
    waitForResources() {
        return __awaiter(this, arguments, void 0, function* (maxWaitMs = 5000) {
            const startTime = Date.now();
            while (Date.now() - startTime < maxWaitMs) {
                if (yield this.checkResources()) {
                    return true;
                }
                yield new Promise(resolve => setTimeout(resolve, 100));
            }
            return false;
        });
    }
    getResourceHistory() {
        return [...this.performanceHistory];
    }
    addCustomAlert(alert) {
        this.alertThresholds.push(alert);
    }
    getHealthSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            const resources = yield this.getDetailedResourceStatus();
            const performance = yield this.getPerformanceMetrics();
            let status = 'healthy';
            if (resources.resourcePressure === 'critical' || !resources.withinLimits) {
                status = 'unhealthy';
            }
            else if (resources.resourcePressure === 'high' || performance.errorRate > 0.05) {
                status = 'degraded';
            }
            return {
                status,
                resources,
                performance,
                uptime: process.uptime()
            };
        });
    }
}
exports.ResourceMonitor = ResourceMonitor;
