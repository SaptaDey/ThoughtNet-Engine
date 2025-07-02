"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretManager = void 0;
exports.loadExternalSecrets = loadExternalSecrets;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class SecretManager {
    constructor(provider = "env") {
        this.provider = provider;
        this.provider = provider.toLowerCase();
    }
    getSecret(name) {
        if (this.provider === "env") {
            return process.env[name];
        }
        // Placeholder for other providers like AWS, GCP, Vault
        logger.warn(`Unknown or unimplemented secrets provider: ${this.provider}`);
        return undefined;
    }
}
exports.SecretManager = SecretManager;
function loadExternalSecrets() {
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
