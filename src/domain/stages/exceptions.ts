
export class StageInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageInitializationError";
  }
}
