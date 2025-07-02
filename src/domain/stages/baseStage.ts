import { GoTProcessorSessionData } from '../models/commonTypes';

export class StageOutput {
  constructor(
    public success: boolean,
    public summary: string,
    public nextStageContextUpdate?: Record<string, any>,
    public errorMessage?: string,
    public metrics?: Record<string, any>
  ) {}
}

export abstract class BaseStage {
  static STAGE_NAME: string;
  abstract stageName: string;

  constructor(protected settings: any) { // Use a more specific type for settings if available
  }

  abstract execute(currentSessionData: GoTProcessorSessionData): Promise<StageOutput>;

  async cleanup(): Promise<void> {
    // Default cleanup implementation, can be overridden by subclasses
  }
}