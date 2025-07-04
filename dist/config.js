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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settings = exports.runtimeSettings = void 0;
const yaml = __importStar(require("js-yaml"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Validate required environment variables
function validateEnvironmentVariables() {
    const requiredVars = [
        'NEO4J_URI',
        'NEO4J_USER',
        'NEO4J_PASSWORD'
    ];
    const optionalVars = [
        'NEO4J_DATABASE',
        'APP_HOST',
        'APP_PORT',
        'APP_LOG_LEVEL',
        'APP_AUTH_TOKEN',
        'PUBMED_API_KEY',
        'PUBMED_EMAIL',
        'GOOGLE_SCHOLAR_API_KEY',
        'EXA_SEARCH_API_KEY'
    ];
    const missingRequired = requiredVars.filter(varName => !process.env[varName]);
    const missingOptional = optionalVars.filter(varName => !process.env[varName]);
    if (missingRequired.length > 0) {
        console.error(`CRITICAL: Missing required environment variables: ${missingRequired.join(', ')}`);
        // In production, always exit on missing required variables
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
        }
        else {
            // In development, warn but allow to continue only if explicit override is set
            if (!process.env.ALLOW_MISSING_ENV_VARS) {
                throw new Error(`Missing required environment variables. Set ALLOW_MISSING_ENV_VARS=true to override in development.`);
            }
            console.warn('⚠️  Development mode: Using default values for missing required variables. This is NOT safe for production!');
        }
    }
    if (missingOptional.length > 0) {
        console.warn(`Optional environment variables not set (using defaults): ${missingOptional.join(', ')}`);
    }
    // Enhanced validation for specific environment variables
    if (process.env.NEO4J_URI && !process.env.NEO4J_URI.startsWith('neo4j://') && !process.env.NEO4J_URI.startsWith('bolt://')) {
        const errorMsg = 'NEO4J_URI must start with neo4j:// or bolt://';
        if (process.env.NODE_ENV === 'production') {
            throw new Error(errorMsg);
        }
        else {
            console.warn(`⚠️  ${errorMsg}`);
        }
    }
    if (process.env.APP_PORT) {
        const port = Number(process.env.APP_PORT);
        if (isNaN(port) || port < 1 || port > 65535) {
            const errorMsg = 'APP_PORT must be a valid port number (1-65535)';
            if (process.env.NODE_ENV === 'production') {
                throw new Error(errorMsg);
            }
            else {
                console.warn(`⚠️  ${errorMsg}`);
            }
        }
    }
    // Validate Neo4j password strength
    if (process.env.NEO4J_PASSWORD) {
        const password = process.env.NEO4J_PASSWORD;
        if (password.length < 8) {
            const errorMsg = 'NEO4J_PASSWORD must be at least 8 characters long';
            if (process.env.NODE_ENV === 'production') {
                throw new Error(errorMsg);
            }
            else {
                console.warn(`⚠️  ${errorMsg}`);
            }
        }
        // Check for default/weak passwords
        const weakPasswords = ['password', 'neo4j', 'admin', '123456', 'test'];
        if (weakPasswords.includes(password.toLowerCase())) {
            const errorMsg = 'NEO4J_PASSWORD appears to be a default or weak password';
            if (process.env.NODE_ENV === 'production') {
                throw new Error(errorMsg);
            }
            else {
                console.warn(`⚠️  ${errorMsg}`);
            }
        }
    }
}
validateEnvironmentVariables();
const AppSettingsSchema = zod_1.z.object({
    name: zod_1.z.string().default('Adaptive Graph of Thoughts'),
    version: zod_1.z.string().default('0.1.0'),
    host: zod_1.z.string().default('0.0.0.0'),
    port: zod_1.z.number().default(8000),
    reload: zod_1.z.boolean().default(true),
    log_level: zod_1.z.string().default('INFO'),
    cors_allowed_origins_str: zod_1.z.string().default('*'),
    auth_token: zod_1.z.string().optional(),
});
const StageConfigSchema = zod_1.z.object({
    name: zod_1.z.string(),
    enabled: zod_1.z.boolean(),
    module_path: zod_1.z.string(),
});
const ASRGoTDefaultParamsSchema = zod_1.z.object({
    initial_confidence: zod_1.z.number().default(0.8),
    confidence_threshold: zod_1.z.number().default(0.75),
    max_iterations: zod_1.z.number().default(10),
    evidence_max_iterations: zod_1.z.number().default(5),
    convergence_threshold: zod_1.z.number().default(0.05),
    pipeline_stages: zod_1.z.array(StageConfigSchema).default([]),
    default_disciplinary_tags: zod_1.z.array(zod_1.z.string()).default([]),
    initial_layer: zod_1.z.string().default("0"),
});
const PubMedConfigSchema = zod_1.z.object({
    api_key: zod_1.z.string().optional(),
    base_url: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    max_results: zod_1.z.number().default(20),
    rate_limit_delay: zod_1.z.number().default(0.5),
});
const GoogleScholarConfigSchema = zod_1.z.object({
    api_key: zod_1.z.string().optional(),
    base_url: zod_1.z.string().optional(),
    max_results: zod_1.z.number().default(10),
    rate_limit_delay: zod_1.z.number().default(1.0),
});
const ExaSearchConfigSchema = zod_1.z.object({
    api_key: zod_1.z.string().optional(),
    base_url: zod_1.z.string().optional(),
    max_results: zod_1.z.number().default(10),
});
const KnowledgeDomainSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string().default(''),
    keywords: zod_1.z.array(zod_1.z.string()).default([]),
});
const LegacyConfigSchema = zod_1.z.object({
    learning_rate: zod_1.z.number().min(0).max(1),
    batch_size: zod_1.z.number().int().min(1).max(10000),
    max_steps: zod_1.z.number().int().min(1).max(1000000),
    app: AppSettingsSchema.default({}),
    asr_got: ASRGoTDefaultParamsSchema.default({}),
    google_scholar: GoogleScholarConfigSchema.optional(),
    pubmed: PubMedConfigSchema.optional(),
    exa_search: ExaSearchConfigSchema.optional(),
    knowledge_domains: zod_1.z.array(KnowledgeDomainSchema).default([]),
});
const Neo4jSettingsSchema = zod_1.z.object({
    uri: zod_1.z.string().min(1, 'Neo4j URI is required'),
    user: zod_1.z.string().min(1, 'Neo4j user is required'),
    password: zod_1.z.string().min(8, 'Neo4j password must be at least 8 characters').refine((pwd) => pwd !== 'password', 'Neo4j password cannot be the default "password"'),
    database: zod_1.z.string().default('neo4j'),
});
const MCPSettingsSchema = zod_1.z.object({
    protocol_version: zod_1.z.string().default('1.0'),
    server_name: zod_1.z.string().default('Adaptive Graph of Thoughts MCP Server'),
    server_version: zod_1.z.string().default('1.0.0'),
    vendor_name: zod_1.z.string().default('Google'),
});
const SettingsFileSchema = zod_1.z.object({
    app: AppSettingsSchema,
    asr_got: ASRGoTDefaultParamsSchema, // Changed from z.record(z.any()) to ASRGoTDefaultParamsSchema
    mcp_settings: MCPSettingsSchema,
    google_scholar: GoogleScholarConfigSchema.optional(),
    pubmed: PubMedConfigSchema.optional(),
    exa_search: ExaSearchConfigSchema.optional(),
    knowledge_domains: zod_1.z.array(KnowledgeDomainSchema).default([]),
});
const RuntimeSettingsSchema = zod_1.z.object({
    app: AppSettingsSchema.default({}),
    neo4j: Neo4jSettingsSchema.default({
        uri: 'bolt://localhost:7687',
        user: 'neo4j',
        password: 'password',
        database: 'neo4j'
    }),
    asr_got: ASRGoTDefaultParamsSchema.default({}),
    mcp_settings: MCPSettingsSchema.default({}),
    google_scholar: GoogleScholarConfigSchema.optional(),
    pubmed: PubMedConfigSchema.optional(),
    exa_search: ExaSearchConfigSchema.optional(),
    knowledge_domains: zod_1.z.array(KnowledgeDomainSchema).default([]),
});
function loadRuntimeSettings() {
    var _a, _b, _c, _d;
    const yamlPath = path.resolve(__dirname, '..', '..', 'config', 'settings.yaml');
    let data = {};
    let configSource = 'defaults';
    if (fs.existsSync(yamlPath)) {
        try {
            const fileContents = fs.readFileSync(yamlPath, 'utf8');
            if (!fileContents.trim()) {
                console.warn(`Configuration file ${yamlPath} is empty. Using defaults.`);
            }
            else {
                const loadedData = yaml.load(fileContents);
                if (!loadedData || typeof loadedData !== 'object') {
                    throw new Error(`Invalid YAML structure in ${yamlPath}`);
                }
                // Validate loaded data against schema
                const validatedData = SettingsFileSchema.parse(loadedData);
                data = validatedData;
                configSource = yamlPath;
                console.log(`Configuration loaded successfully from ${yamlPath}`);
            }
        }
        catch (error) {
            console.error(`Failed to load configuration from ${yamlPath}: ${error}`);
            if (process.env.NODE_ENV === 'production') {
                throw new Error(`Critical: Configuration loading failed in production. ${error}`);
            }
            else {
                console.warn(`Development mode: Continuing with default configuration.`);
                data = {};
            }
        }
    }
    else {
        console.warn(`Configuration file ${yamlPath} not found. Using environment variables and defaults.`);
    }
    // Merge with environment variables for Neo4j settings
    const neo4jFromEnv = {
        uri: process.env.NEO4J_URI,
        user: process.env.NEO4J_USER,
        password: process.env.NEO4J_PASSWORD,
        database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    // Only include neo4j settings if they're available
    if (neo4jFromEnv.uri && neo4jFromEnv.user && neo4jFromEnv.password) {
        data.neo4j = neo4jFromEnv;
    }
    // Merge app settings from environment
    const appFromEnv = {
        host: process.env.APP_HOST || ((_a = data.app) === null || _a === void 0 ? void 0 : _a.host),
        port: process.env.APP_PORT ? parseInt(process.env.APP_PORT) : (_b = data.app) === null || _b === void 0 ? void 0 : _b.port,
        log_level: process.env.APP_LOG_LEVEL || ((_c = data.app) === null || _c === void 0 ? void 0 : _c.log_level),
        auth_token: process.env.APP_AUTH_TOKEN || ((_d = data.app) === null || _d === void 0 ? void 0 : _d.auth_token)
    };
    data.app = Object.assign(Object.assign({}, data.app), appFromEnv);
    try {
        const runtimeSettings = RuntimeSettingsSchema.parse(data);
        console.log(`Runtime settings initialized from ${configSource}`);
        return runtimeSettings;
    }
    catch (error) {
        console.error(`Failed to validate runtime settings: ${error}`);
        throw new Error(`Critical: Runtime settings validation failed. ${error}`);
    }
}
exports.runtimeSettings = loadRuntimeSettings();
exports.settings = exports.runtimeSettings;
