import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { GoTProcessorSessionData, ComposedOutput } from '../domain/models/commonTypes';
import { StageExecutionError } from '../domain/services/exceptions';
import { ResourceMonitor } from '../services/resourceMonitor';
import { BaseStage, StageOutput } from '../domain/stages/baseStage';
import { StageInitializationError } from '../domain/stages/exceptions';
import { settings } from '../config';
import { InitializationStage } from '../domain/stages/initializationStage';
import { DecompositionStage } from '../domain/stages/decompositionStage';
import { HypothesisStage } from '../domain/stages/hypothesisStage';
import { EvidenceStage } from '../domain/stages/evidenceStage';
import { PruningMergingStage } from '../domain/stages/pruningMergingStage';
import { SubgraphExtractionStage } from '../domain/stages/subgraphExtractionStage';
import { CompositionStage } from '../domain/stages/compositionStage';
import { ReflectionStage } from '../domain/stages/reflectionStage';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

interface ProcessingCheckpoint {
  sessionData: GoTProcessorSessionData;
  stageIndex: number;
  timestamp: number;
  resourceSnapshot: any;
}

interface StateManager {
  checkpoints: ProcessingCheckpoint[];
  currentState: GoTProcessorSessionData;
  stateHistory: Array<{ stage: string; timestamp: number; state: any }>;
  rollbackStack: ProcessingCheckpoint[];
}

function createCheckpoint(sessionData: GoTProcessorSessionData, stageIndex: number, resourceSnapshot?: any): ProcessingCheckpoint {
  return {
    sessionData: JSON.parse(JSON.stringify(sessionData)), // Deep copy
    stageIndex,
    timestamp: Date.now(),
    resourceSnapshot: resourceSnapshot || {}
  };
}

function createStateManager(initialSessionData: GoTProcessorSessionData): StateManager {
  return {
    checkpoints: [],
    currentState: JSON.parse(JSON.stringify(initialSessionData)),
    stateHistory: [],
    rollbackStack: []
  };
}

function saveCheckpoint(stateManager: StateManager, sessionData: GoTProcessorSessionData, stageIndex: number, stageName: string): void {
  const checkpoint = createCheckpoint(sessionData, stageIndex);
  stateManager.checkpoints.push(checkpoint);
  stateManager.rollbackStack.push(checkpoint);
  
  // Save state history for debugging
  stateManager.stateHistory.push({
    stage: stageName,
    timestamp: Date.now(),
    state: {
      nodeCount: Object.keys(sessionData.accumulated_context?.nodes || {}).length,
      edgeCount: Object.keys(sessionData.accumulated_context?.edges || {}).length,
      confidence: sessionData.final_confidence_vector
    }
  });
  
  // Keep only last 10 checkpoints to prevent memory leaks
  if (stateManager.checkpoints.length > 10) {
    stateManager.checkpoints = stateManager.checkpoints.slice(-10);
  }
  
  if (stateManager.rollbackStack.length > 5) {
    stateManager.rollbackStack = stateManager.rollbackStack.slice(-5);
  }
}

function restoreFromCheckpoint(sessionData: GoTProcessorSessionData, checkpoint: ProcessingCheckpoint): void {
  for (const key in checkpoint.sessionData) {
    if (Object.prototype.hasOwnProperty.call(checkpoint.sessionData, key)) {
      (sessionData as any)[key] = JSON.parse(JSON.stringify((checkpoint.sessionData as any)[key]));
    }
  }
  logger.info(`State restored from checkpoint at stage index ${checkpoint.stageIndex}`);
}

function validateSessionDataIntegrity(sessionData: GoTProcessorSessionData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!sessionData.session_id) {
    errors.push('Missing session_id');
  }
  
  if (!sessionData.query || sessionData.query.trim().length === 0) {
    errors.push('Missing or empty query');
  }
  
  if (!sessionData.accumulated_context) {
    errors.push('Missing accumulated_context');
    sessionData.accumulated_context = {};
  }
  
  if (!Array.isArray(sessionData.stage_outputs_trace)) {
    errors.push('Invalid stage_outputs_trace - must be array');
    sessionData.stage_outputs_trace = [];
  }
  
  // Validate confidence vector format
  if (sessionData.final_confidence_vector) {
    const parts = sessionData.final_confidence_vector.split(',');
    if (parts.length !== 4 || parts.some(p => isNaN(parseFloat(p)))) {
      errors.push('Invalid confidence vector format');
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

function mergeContextSafely(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const merged = { ...target };
  
  for (const [key, value] of Object.entries(source)) {
    if (key in merged) {
      // Handle conflicts by preserving both values
      if (Array.isArray(merged[key]) && Array.isArray(value)) {
        merged[key] = [...merged[key], ...value];
      } else if (typeof merged[key] === 'object' && typeof value === 'object') {
        merged[key] = { ...merged[key], ...value };
      } else {
        // Create conflict resolution
        merged[`${key}_previous`] = merged[key];
        merged[key] = value;
      }
    } else {
      merged[key] = value;
    }
  }
  
  return merged;
}

async function cleanupStageResources(stageInstance: BaseStage): Promise<void> {
  if (typeof (stageInstance as any).cleanup === 'function') {
    try {
      await (stageInstance as any).cleanup();
    } catch (cleanupError: any) {
      logger.warn(`Cleanup failed for ${stageInstance.constructor.name}: ${cleanupError.message}`);
    }
  }
}

async function executeStageSafely(
  stageInstance: BaseStage,
  sessionData: GoTProcessorSessionData
): Promise<StageOutput> {
  try {
    return await stageInstance.execute(sessionData);
  } catch (error: any) {
    await cleanupStageResources(stageInstance);
    if (error instanceof StageInitializationError) {
      logger.error(`Stage initialization failed: ${error.message}`);
    } else if (error.name === 'ZodError') { // Assuming ZodError for validation errors
      logger.error(`Stage validation failed: ${error.message}`);
    } else {
      logger.error(`Unexpected error in stage ${stageInstance.constructor.name}: ${error.message}`);
    }
    throw new StageExecutionError(stageInstance.constructor.name, error);
  }
}

async function executeStageWithRecovery(
  stageInstance: BaseStage,
  sessionData: GoTProcessorSessionData,
  stageIndex: number
): Promise<StageOutput> {
  const checkpoint = createCheckpoint(sessionData, stageIndex);
  try {
    return await stageInstance.execute(sessionData);
  } catch (error: any) {
    logger.error(`Recoverable error in ${stageInstance.constructor.name}: ${error.message}`);
    await restoreFromCheckpoint(sessionData, checkpoint);
    throw new StageExecutionError(stageInstance.constructor.name, error, checkpoint);
  }
}

// Dynamically import stages based on their module paths
const importStages = (): Record<string, { new (settings: any): BaseStage; STAGE_NAME: string }> => {
  const stages: Record<string, { new (settings: any): BaseStage; STAGE_NAME: string }> = {};
  // This is a simplified example. In a real scenario, you'd dynamically import
  // modules based on the `module_path` from settings.asr_got.pipeline_stages.
  // For now, we'll manually add the InitializationStage.
  stages["InitializationStage"] = InitializationStage;
  stages["DecompositionStage"] = DecompositionStage;
  stages["HypothesisStage"] = HypothesisStage;
  stages["EvidenceStage"] = EvidenceStage;
  stages["PruningMergingStage"] = PruningMergingStage;
  stages["SubgraphExtractionStage"] = SubgraphExtractionStage;
  stages["CompositionStage"] = CompositionStage;
  stages["ReflectionStage"] = ReflectionStage;
  return stages;
};

export class GoTProcessor {
  private settings: any; // Use a more specific type if available
  private resourceMonitor: ResourceMonitor;
  private stages: BaseStage[] = [];
  public modelsLoaded: boolean = false;
  private stateManager?: StateManager;
  private isProcessing: boolean = false;
  private activeSessionId?: string;

  constructor(settings: any, resourceMonitor?: ResourceMonitor) {
    this.settings = settings;
    this.resourceMonitor = resourceMonitor || new ResourceMonitor();

    logger.info("Initializing GoTProcessor");
    this.stages = this.initializeStages();
    logger.info(
      `GoTProcessor initialized with ${this.stages.length} configured and enabled stages.`
    );
    this.modelsLoaded = true;
  }

  public getProcessingStatus(): { isProcessing: boolean; activeSessionId?: string; stageCount: number } {
    return {
      isProcessing: this.isProcessing,
      activeSessionId: this.activeSessionId,
      stageCount: this.stages.length
    };
  }

  public getStateHistory(): Array<{ stage: string; timestamp: number; state: any }> {
    return this.stateManager?.stateHistory || [];
  }

  public async rollbackToLastCheckpoint(): Promise<boolean> {
    if (!this.stateManager || this.stateManager.rollbackStack.length === 0) {
      logger.warn('No checkpoints available for rollback');
      return false;
    }
    
    const lastCheckpoint = this.stateManager.rollbackStack.pop();
    if (lastCheckpoint) {
      this.stateManager.currentState = JSON.parse(JSON.stringify(lastCheckpoint.sessionData));
      logger.info(`Rolled back to checkpoint from stage index ${lastCheckpoint.stageIndex}`);
      return true;
    }
    
    return false;
  }

  private initializeStages(): BaseStage[] {
    const initializedStages: BaseStage[] = [];
    const availableStages = importStages();

    if (!this.settings.asr_got || !this.settings.asr_got.pipeline_stages || this.settings.asr_got.pipeline_stages.length === 0) {
      logger.warn("Pipeline stages not defined or empty in settings.asr_got.pipeline_stages. Processor will have no stages.");
      return initializedStages;
    }

    for (const stageConfig of this.settings.asr_got.pipeline_stages) {
      if (stageConfig.enabled) {
        try {
          // This part needs to map module_path to the actual imported class
          // For now, we'll use a direct lookup based on stage name.
          const StageClass = availableStages[stageConfig.name];

          if (!StageClass) {
            logger.error(`Configured stage class for stage '${stageConfig.name}' not found. Skipping.`);
            continue;
          }

          const stageInstance = new StageClass(this.settings);
          initializedStages.push(stageInstance);
          logger.info(
            `Successfully loaded and initialized stage: '${stageConfig.name}' from ${stageConfig.module_path}`
          );
        } catch (error: any) {
          logger.error(
            `An unexpected error occurred while loading stage '${stageConfig.name}': ${error.message}`
          );
          throw new Error(`Unexpected error loading stage: ${stageConfig.name}`);
        }
      } else {
        logger.info(
          `Stage '${stageConfig.name}' is disabled and will not be loaded.`
        );
      }
    }

    return initializedStages;
  }

  async processQuery(
    query: string,
    sessionId?: string,
    operationalParams?: Record<string, any>,
    initialContext?: Record<string, any>
  ): Promise<GoTProcessorSessionData> {
    const startTotalTime = process.hrtime.bigint();
    logger.info(`Starting Adaptive Graph of Thoughts query processing for: ${query.substring(0, 100)}...`);

    // Prevent concurrent processing
    if (this.isProcessing) {
      throw new Error(`GoTProcessor is already processing session: ${this.activeSessionId}`);
    }

    const currentSessionId = sessionId || `session-${uuidv4()}`;
    this.isProcessing = true;
    this.activeSessionId = currentSessionId;

    const currentSessionData: GoTProcessorSessionData = {
      session_id: currentSessionId,
      query: query,
      final_answer: '',
      final_confidence_vector: '0.5,0.5,0.5,0.5',
      accumulated_context: {},
      stage_outputs_trace: [],
    };

    // Validate initial session data
    const validation = validateSessionDataIntegrity(currentSessionData);
    if (!validation.isValid) {
      logger.error(`Session data validation failed: ${validation.errors.join(', ')}`);
      this.isProcessing = false;
      this.activeSessionId = undefined;
      throw new Error(`Invalid session data: ${validation.errors.join(', ')}`);
    }

    // Initialize state management
    this.stateManager = createStateManager(currentSessionData);

    try {
      if (initialContext) {
        currentSessionData.accumulated_context = mergeContextSafely(
          currentSessionData.accumulated_context,
          { initial_context: initialContext }
        );
      }

      const opParams = operationalParams || {};
      currentSessionData.accumulated_context = mergeContextSafely(
        currentSessionData.accumulated_context,
        { operational_params: opParams }
      );

      if (this.stages.length === 0) {
        logger.error("No stages initialized for GoTProcessor. Cannot process query.");
        currentSessionData.final_answer = "Error: Query processor is not configured with any processing stages.";
        currentSessionData.final_confidence_vector = '0.0,0.0,0.0,0.0';
        return currentSessionData;
      }

      logger.info(`Executing ${this.stages.length} configured processing stages.`);

      // Save initial checkpoint
      saveCheckpoint(this.stateManager, currentSessionData, -1, 'initialization');

      for (let i = 0; i < this.stages.length; i++) {
        const stageInstance = this.stages[i];
        const stageNameForLog = stageInstance.stageName;
        
        // Check resources before each stage
        if (!(await this.resourceMonitor.checkResources())) {
          logger.error(
            `Resource limits exceeded; halting processing before stage ${stageNameForLog}`
          );
          currentSessionData.final_answer = "Processing halted due to server resource limits.";
          currentSessionData.final_confidence_vector = '0.0,0.0,0.0,0.0';
          break;
        }

        // Save checkpoint before stage execution
        saveCheckpoint(this.stateManager, currentSessionData, i, stageNameForLog);

        // Validate session data integrity before stage execution
        const preStageValidation = validateSessionDataIntegrity(currentSessionData);
        if (!preStageValidation.isValid) {
          logger.error(`Session data corrupted before stage ${stageNameForLog}: ${preStageValidation.errors.join(', ')}`);
          
          // Attempt to restore from last checkpoint
          if (await this.rollbackToLastCheckpoint()) {
            logger.info(`Restored session data from checkpoint before retrying stage ${stageNameForLog}`);
            continue; // Retry the stage
          } else {
            throw new Error(`Session data corruption could not be recovered: ${preStageValidation.errors.join(', ')}`);
          }
        }

        const stageStartTime = process.hrtime.bigint();
        const currentStageContextKey = stageInstance.stageName;

        logger.info(
          `Executing stage ${i + 1}/${this.stages.length}: ${stageNameForLog} (Context Key: ${currentStageContextKey})`
        );

        try {
          // Execute stage with enhanced error handling
          const stageResult = await this.executeStageWithRecovery(stageInstance, currentSessionData, i);

          // Validate stage output
          if (stageResult) {
            this.processStageResult(stageResult, currentSessionData, stageNameForLog, i);
          } else {
            logger.warn(`Stage ${stageNameForLog} returned null result - continuing with empty result`);
          }

          const stageDurationMs = Number(process.hrtime.bigint() - stageStartTime) / 1_000_000;
          this.recordStageExecution(currentSessionData, i, stageNameForLog, stageDurationMs, stageResult);

          // Check for critical errors that should halt processing
          if (stageResult?.errorMessage && this.shouldHaltOnError(stageResult.errorMessage)) {
            logger.error(`Halting due to critical error in ${stageNameForLog}: ${stageResult.errorMessage}`);
            currentSessionData.final_answer = `A critical error occurred during the '${stageNameForLog}' stage. Processing cannot continue.`;
            currentSessionData.final_confidence_vector = '0.0,0.0,0.0,0.0';
            break;
          }

          // Update state manager current state
          this.stateManager!.currentState = JSON.parse(JSON.stringify(currentSessionData));

        } catch (error: any) {
          logger.error(`Critical error during execution of stage ${stageNameForLog}: ${error.message}`);
          
          // Attempt recovery
          const recovered = await this.handleStageFailure(error, stageNameForLog, currentSessionData, i);
          if (!recovered) {
            currentSessionData.final_answer = `Processing failed at stage '${stageNameForLog}': ${error.message}`;
            currentSessionData.final_confidence_vector = '0.0,0.0,0.0,0.0';
            break;
          }
        }
      }
      
      // Final validation and cleanup
      return this.finalizeProcessing(currentSessionData, startTotalTime);
      
    } catch (error: any) {
      logger.error(`Fatal error in GoTProcessor.processQuery: ${error.message}`);
      currentSessionData.final_answer = `Fatal error during processing: ${error.message}`;
      currentSessionData.final_confidence_vector = '0.0,0.0,0.0,0.0';
      return currentSessionData;
    } finally {
      this.isProcessing = false;
      this.activeSessionId = undefined;
      this.stateManager = undefined;
    }
  }

  private async executeStageWithRecovery(
    stageInstance: BaseStage, 
    sessionData: GoTProcessorSessionData, 
    stageIndex: number
  ): Promise<StageOutput | null> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retrying stage ${stageInstance.stageName}, attempt ${attempt + 1}/${maxRetries + 1}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Progressive delay
        }
        
        return await executeStageSafely(stageInstance, sessionData);
        
      } catch (error: any) {
        lastError = error;
        logger.warn(`Stage ${stageInstance.stageName} failed on attempt ${attempt + 1}: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Try to restore from checkpoint for retry
          if (this.stateManager && this.stateManager.rollbackStack.length > 0) {
            const checkpoint = this.stateManager.rollbackStack[this.stateManager.rollbackStack.length - 1];
            if (checkpoint.stageIndex === stageIndex - 1) {
              restoreFromCheckpoint(sessionData, checkpoint);
              logger.info(`Restored state for retry of stage ${stageInstance.stageName}`);
            }
          }
        }
      }
    }
    
    throw lastError || new Error(`Stage ${stageInstance.stageName} failed after ${maxRetries + 1} attempts`);
  }

  private processStageResult(
    stageResult: StageOutput, 
    sessionData: GoTProcessorSessionData, 
    stageName: string, 
    stageIndex: number
  ): void {
    logger.debug(`--- Processing output from Stage: ${stageName} ---`);
    
    if (stageResult.errorMessage) {
      logger.error(`Stage ${stageName} reported an error: ${stageResult.errorMessage}`);
    }
    
    if (stageResult.nextStageContextUpdate) {
      logger.debug(`Merging context update from stage ${stageName}`);
      sessionData.accumulated_context = mergeContextSafely(
        sessionData.accumulated_context,
        stageResult.nextStageContextUpdate
      );
    } else {
      logger.debug(`Stage ${stageName} produced no context update`);
    }
    
    if (stageResult.summary) {
      logger.debug(`Summary: ${stageResult.summary}`);
    }
    
    if (stageResult.metrics) {
      logger.debug(`Metrics: ${JSON.stringify(stageResult.metrics)}`);
    }
    
    logger.debug(`--- End processing output from Stage: ${stageName} ---`);
  }

  private recordStageExecution(
    sessionData: GoTProcessorSessionData,
    stageIndex: number,
    stageName: string,
    durationMs: number,
    stageResult: StageOutput | null
  ): void {
    let traceSummary = `Completed ${stageName}`;
    if (stageResult?.summary) {
      traceSummary = stageResult.summary;
    }

    const traceEntry: Record<string, any> = {
      stage_number: stageIndex + 1,
      stage_name: stageName,
      duration_ms: Math.round(durationMs * 100) / 100,
      summary: traceSummary,
      timestamp: new Date().toISOString(),
    };
    
    if (stageResult?.errorMessage) {
      traceEntry.error = stageResult.errorMessage;
      if (!traceSummary.includes(stageResult.errorMessage)) {
        traceEntry.summary = `${traceSummary} (Error: ${stageResult.errorMessage})`;
      }
    }

    if (stageResult?.metrics) {
      traceEntry.metrics = stageResult.metrics;
    }

    sessionData.stage_outputs_trace.push(traceEntry);
    logger.info(`Completed stage ${stageIndex + 1}: ${stageName} in ${durationMs.toFixed(2)}ms`);
  }

  private shouldHaltOnError(errorMessage: string): boolean {
    const criticalErrorPatterns = [
      /database.*connection.*failed/i,
      /out of memory/i,
      /stack overflow/i,
      /critical.*system.*error/i,
      /authentication.*failed/i,
      /permission.*denied/i
    ];
    
    return criticalErrorPatterns.some(pattern => pattern.test(errorMessage));
  }

  private async handleStageFailure(
    error: Error,
    stageName: string,
    sessionData: GoTProcessorSessionData,
    stageIndex: number
  ): Promise<boolean> {
    logger.error(`Handling failure in stage ${stageName}: ${error.message}`);
    
    // Try to rollback to previous checkpoint
    if (await this.rollbackToLastCheckpoint()) {
      logger.info(`Successfully rolled back from failed stage ${stageName}`);
      
      // Record the failure in the trace
      const failureTrace = {
        stage_number: stageIndex + 1,
        stage_name: stageName,
        duration_ms: 0,
        summary: `Failed and rolled back: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString(),
        recovery_action: 'rollback_to_checkpoint'
      };
      
      sessionData.stage_outputs_trace.push(failureTrace);
      return false; // Don't continue processing after rollback
    }
    
    logger.error(`Could not recover from stage failure: ${stageName}`);
    return false;
  }

  private finalizeProcessing(sessionData: GoTProcessorSessionData, startTime: bigint): GoTProcessorSessionData {
    const totalDurationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    
    // Set default final answer if none was set
    if (!sessionData.final_answer || sessionData.final_answer.trim().length === 0) {
      sessionData.final_answer = "Processing completed, but no final answer was generated.";
    }
    
    // Ensure confidence vector is properly formatted
    if (!sessionData.final_confidence_vector || !sessionData.final_confidence_vector.includes(',')) {
      sessionData.final_confidence_vector = '0.5,0.5,0.5,0.5';
    }
    
    // Add processing metadata
    sessionData.accumulated_context.processing_metadata = {
      total_duration_ms: Math.round(totalDurationMs * 100) / 100,
      stages_executed: sessionData.stage_outputs_trace.length,
      completion_time: new Date().toISOString(),
      success: !sessionData.final_answer.toLowerCase().includes('error') && 
               !sessionData.final_answer.toLowerCase().includes('failed')
    };
    
    logger.info(`GoTProcessor completed in ${totalDurationMs.toFixed(2)}ms with ${sessionData.stage_outputs_trace.length} stages`);
    
    return sessionData;
  }

  async shutdownResources(): Promise<void> {
    logger.info("Shutting down GoTProcessor resources");
    
    // Clean up any active processing
    if (this.isProcessing) {
      logger.warn("Shutting down while processing is active");
      this.isProcessing = false;
      this.activeSessionId = undefined;
    }
    
    // Clear state manager
    this.stateManager = undefined;
    
    // Cleanup individual stages
    for (const stage of this.stages) {
      await cleanupStageResources(stage);
    }
    
    logger.info("GoTProcessor resources shutdown complete");
  }
}