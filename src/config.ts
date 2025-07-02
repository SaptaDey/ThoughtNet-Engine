
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
function validateEnvironmentVariables(): void {
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
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
        } else {
            console.warn('Development mode: Using default values for missing required variables.');
        }
    }
    
    if (missingOptional.length > 0) {
        console.warn(`Optional environment variables not set (using defaults): ${missingOptional.join(', ')}`);
    }
    
    // Validate specific environment variable formats
    if (process.env.NEO4J_URI && !process.env.NEO4J_URI.startsWith('neo4j://') && !process.env.NEO4J_URI.startsWith('bolt://')) {
        console.warn('NEO4J_URI should start with neo4j:// or bolt://');
    }
    
    if (process.env.APP_PORT && (isNaN(Number(process.env.APP_PORT)) || Number(process.env.APP_PORT) < 1 || Number(process.env.APP_PORT) > 65535)) {
        console.warn('APP_PORT should be a valid port number (1-65535)');
    }
}

validateEnvironmentVariables();

const AppSettingsSchema = z.object({
  name: z.string().default('Adaptive Graph of Thoughts'),
  version: z.string().default('0.1.0'),
  host: z.string().default('0.0.0.0'),
  port: z.number().default(8000),
  reload: z.boolean().default(true),
  log_level: z.string().default('INFO'),
  cors_allowed_origins_str: z.string().default('*'),
  auth_token: z.string().optional(),
});

type AppSettings = z.infer<typeof AppSettingsSchema>;

const StageConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  module_path: z.string(),
});

type StageConfig = z.infer<typeof StageConfigSchema>;

const ASRGoTDefaultParamsSchema = z.object({
    initial_confidence: z.number().default(0.8),
    confidence_threshold: z.number().default(0.75),
    max_iterations: z.number().default(10),
    evidence_max_iterations: z.number().default(5),
    convergence_threshold: z.number().default(0.05),
    pipeline_stages: z.array(StageConfigSchema).default([]),
    default_disciplinary_tags: z.array(z.string()).default([]),
    initial_layer: z.string().default("0"),
});

type ASRGoTDefaultParams = z.infer<typeof ASRGoTDefaultParamsSchema>;


const PubMedConfigSchema = z.object({
    api_key: z.string().optional(),
    base_url: z.string().optional(),
    email: z.string().optional(),
    max_results: z.number().default(20),
    rate_limit_delay: z.number().default(0.5),
});

type PubMedConfig = z.infer<typeof PubMedConfigSchema>;

const GoogleScholarConfigSchema = z.object({
    api_key: z.string().optional(),
    base_url: z.string().optional(),
    max_results: z.number().default(10),
    rate_limit_delay: z.number().default(1.0),
});

type GoogleScholarConfig = z.infer<typeof GoogleScholarConfigSchema>;

const ExaSearchConfigSchema = z.object({
    api_key: z.string().optional(),
    base_url: z.string().optional(),
    max_results: z.number().default(10),
});

type ExaSearchConfig = z.infer<typeof ExaSearchConfigSchema>;


const KnowledgeDomainSchema = z.object({
    name: z.string(),
    description: z.string().default(''),
    keywords: z.array(z.string()).default([]),
});

type KnowledgeDomain = z.infer<typeof KnowledgeDomainSchema>;


const LegacyConfigSchema = z.object({
    learning_rate: z.number().min(0).max(1),
    batch_size: z.number().int().min(1).max(10000),
    max_steps: z.number().int().min(1).max(1000000),
    app: AppSettingsSchema.default({}),
    asr_got: ASRGoTDefaultParamsSchema.default({}),
    google_scholar: GoogleScholarConfigSchema.optional(),
    pubmed: PubMedConfigSchema.optional(),
    exa_search: ExaSearchConfigSchema.optional(),
    knowledge_domains: z.array(KnowledgeDomainSchema).default([]),
});

type LegacyConfig = z.infer<typeof LegacyConfigSchema>;


const Neo4jSettingsSchema = z.object({
  uri: z.string().min(1, 'Neo4j URI is required'),
  user: z.string().min(1, 'Neo4j user is required'),
  password: z.string().min(8, 'Neo4j password must be at least 8 characters').refine(
    (pwd) => pwd !== 'password', 
    'Neo4j password cannot be the default "password"'
  ),
  database: z.string().default('neo4j'),
});

type Neo4jSettings = z.infer<typeof Neo4jSettingsSchema>;

const MCPSettingsSchema = z.object({
    protocol_version: z.string().default('1.0'),
    server_name: z.string().default('Adaptive Graph of Thoughts MCP Server'),
    server_version: z.string().default('1.0.0'),
    vendor_name: z.string().default('Google'),
});

type MCPSettings = z.infer<typeof MCPSettingsSchema>;

const SettingsFileSchema = z.object({
    app: AppSettingsSchema,
    asr_got: ASRGoTDefaultParamsSchema, // Changed from z.record(z.any()) to ASRGoTDefaultParamsSchema
    mcp_settings: MCPSettingsSchema,
    google_scholar: GoogleScholarConfigSchema.optional(),
    pubmed: PubMedConfigSchema.optional(),
    exa_search: ExaSearchConfigSchema.optional(),
    knowledge_domains: z.array(KnowledgeDomainSchema).default([]),
});

type SettingsFile = z.infer<typeof SettingsFileSchema>;

const RuntimeSettingsSchema = z.object({
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
    knowledge_domains: z.array(KnowledgeDomainSchema).default([]),
});

type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

function loadRuntimeSettings(): RuntimeSettings {
    const yamlPath = path.resolve(__dirname, '..', '..', 'config', 'settings.yaml');
    let data = {};
    let configSource = 'defaults';
    
    if (fs.existsSync(yamlPath)) {
        try {
            const fileContents = fs.readFileSync(yamlPath, 'utf8');
            if (!fileContents.trim()) {
                console.warn(`Configuration file ${yamlPath} is empty. Using defaults.`);
            } else {
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
        } catch (error) {
            console.error(`Failed to load configuration from ${yamlPath}: ${error}`);
            if (process.env.NODE_ENV === 'production') {
                throw new Error(`Critical: Configuration loading failed in production. ${error}`);
            } else {
                console.warn(`Development mode: Continuing with default configuration.`);
                data = {};
            }
        }
    } else {
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
        (data as any).neo4j = neo4jFromEnv;
    }

    // Merge app settings from environment
    const appFromEnv = {
        host: process.env.APP_HOST || (data as any).app?.host,
        port: process.env.APP_PORT ? parseInt(process.env.APP_PORT) : (data as any).app?.port,
        log_level: process.env.APP_LOG_LEVEL || (data as any).app?.log_level,
        auth_token: process.env.APP_AUTH_TOKEN || (data as any).app?.auth_token
    };

    (data as any).app = { ...(data as any).app, ...appFromEnv };

    try {
        const runtimeSettings = RuntimeSettingsSchema.parse(data);
        console.log(`Runtime settings initialized from ${configSource}`);
        return runtimeSettings;
    } catch (error) {
        console.error(`Failed to validate runtime settings: ${error}`);
        throw new Error(`Critical: Runtime settings validation failed. ${error}`);
    }
}

export const runtimeSettings = loadRuntimeSettings();
export const settings = runtimeSettings;
