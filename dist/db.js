"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.driver = void 0;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const validateDatabaseConfig = () => {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !user || !password) {
        const missing = [];
        if (!uri)
            missing.push('NEO4J_URI');
        if (!user)
            missing.push('NEO4J_USER');
        if (!password)
            missing.push('NEO4J_PASSWORD');
        throw new Error(`Critical: Missing required database configuration: ${missing.join(', ')}. Please set these environment variables.`);
    }
    if (password === 'password' || password.length < 8) {
        throw new Error('Critical: NEO4J_PASSWORD must be at least 8 characters and cannot be the default "password".');
    }
    if (!uri.startsWith('neo4j://') && !uri.startsWith('bolt://')) {
        throw new Error('Critical: NEO4J_URI must start with neo4j:// or bolt://');
    }
    return { uri, user, password };
};
const { uri, user, password } = validateDatabaseConfig();
exports.driver = neo4j_driver_1.default.driver(uri, neo4j_driver_1.default.auth.basic(user, password));
