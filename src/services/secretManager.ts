
import winston from 'winston';
import { settings } from '../config';

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

export class SecretManager {
  constructor(private provider: string = "env") {
    this.provider = provider.toLowerCase();
  }

  getSecret(name: string): string | undefined {
    if (this.provider === "env") {
      return process.env[name];
    }
    // Placeholder for other providers like AWS, GCP, Vault
    logger.warn(`Unknown or unimplemented secrets provider: ${this.provider}`);
    return undefined;
  }
}

export function loadExternalSecrets(): void {
  const provider = process.env.SECRETS_PROVIDER;
  if (!provider || provider.toLowerCase() === "env") {
    return;
  }

  const manager = new SecretManager(provider);
  const secretVars = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NEO4J_PASSWORD"];

  for (const varName of secretVars) {
    if (process.env[varName]) {
      continue;
    }
    const secretName = process.env[`${varName}_SECRET_NAME`] || varName;
    const secret = manager.getSecret(secretName);
    if (secret) {
      process.env[varName] = secret;
      logger.debug(`Successfully loaded secret from ${provider} (variable count: 1)`);
    }
  }
}
