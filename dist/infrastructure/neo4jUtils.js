"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Neo4jError = void 0;
exports.initializeNeo4jManager = initializeNeo4jManager;
exports.executeQuery = executeQuery;
exports.executeInTransaction = executeInTransaction;
exports.closeNeo4jConnection = closeNeo4jConnection;
exports.healthCheckNeo4j = healthCheckNeo4j;
exports.executeBatchInTransaction = executeBatchInTransaction;
const neo4j_driver_1 = require("neo4j-driver");
const neo4jDatabaseManager_1 = require("../infrastructure/neo4jDatabaseManager");
class Neo4jError extends Error {
    constructor(message, originalError) {
        super(message);
        this.originalError = originalError;
        this.name = "Neo4jError";
        if (originalError) {
            this.stack = originalError.stack;
        }
    }
}
exports.Neo4jError = Neo4jError;
// Dependency injection pattern instead of singleton
class Neo4jService {
    constructor() {
        this.manager = null;
        this.isInitialized = false;
    }
    static getInstance() {
        if (!Neo4jService.instance) {
            Neo4jService.instance = new Neo4jService();
        }
        return Neo4jService.instance;
    }
    initialize() {
        if (!this.isInitialized) {
            this.manager = new neo4jDatabaseManager_1.Neo4jDatabaseManager();
            this.isInitialized = true;
        }
    }
    getManager() {
        if (!this.isInitialized || !this.manager) {
            throw new Neo4jError("Neo4jService not initialized. Call initialize() first.");
        }
        return this.manager;
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.manager) {
                yield this.manager.closeConnection();
                this.manager = null;
                this.isInitialized = false;
            }
        });
    }
}
Neo4jService.instance = null;
const neo4jService = Neo4jService.getInstance();
function initializeNeo4jManager() {
    neo4jService.initialize();
}
function executeQuery(query_1, parameters_1) {
    return __awaiter(this, arguments, void 0, function* (query, parameters, txType = "read") {
        const manager = neo4jService.getManager();
        try {
            return yield manager.executeQuery(query, parameters, undefined, txType);
        }
        catch (error) {
            if (error instanceof neo4j_driver_1.Neo4jError) {
                throw new Neo4jError(`Neo4j driver error: ${error.message}`, error);
            }
            else {
                throw new Neo4jError(`Error executing Neo4j query: ${error.message}`, error);
            }
        }
    });
}
function executeInTransaction(operations_1) {
    return __awaiter(this, arguments, void 0, function* (operations, txType = "write") {
        const manager = neo4jService.getManager();
        try {
            return yield manager.executeInTransaction(operations, txType);
        }
        catch (error) {
            throw new Neo4jError(`Transaction execution failed: ${error.message}`, error);
        }
    });
}
function closeNeo4jConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        yield neo4jService.dispose();
    });
}
function healthCheckNeo4j() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const manager = neo4jService.getManager();
            return yield manager.healthCheck();
        }
        catch (error) {
            return false;
        }
    });
}
function executeBatchInTransaction(queries_1) {
    return __awaiter(this, arguments, void 0, function* (queries, txType = "write") {
        return executeInTransaction((tx) => __awaiter(this, void 0, void 0, function* () {
            const results = [];
            for (const { query, parameters } of queries) {
                const result = yield tx.run(query, parameters);
                results.push(result.records.map((record) => record.toObject()));
            }
            return results;
        }), txType);
    });
}
