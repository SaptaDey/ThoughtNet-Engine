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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitializationStage = void 0;
const uuid_1 = require("uuid");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const common_1 = require("../models/common");
const baseStage_1 = require("./baseStage");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
const neo4jHelpers_1 = require("../utils/neo4jHelpers");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class InitializationStage extends baseStage_1.BaseStage {
    constructor(settings) {
        var _a, _b;
        super(settings);
        this.stageName = InitializationStage.STAGE_NAME;
        this.rootNodeLabel = "Task Understanding";
        // Assuming settings.asr_got.default_parameters exists and has these properties
        this.initialConfidenceValues = ((_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.initial_confidence) || [0.5, 0.5, 0.5, 0.5];
        this.initialLayer = ((_b = settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.initial_layer) || "0";
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this._logStart(currentSessionData.session_id);
            const initialQuery = currentSessionData.query;
            const operationalParams = currentSessionData.accumulated_context.operational_params || {};
            let nodesCreatedInNeo4j = 0;
            let usedExistingNeo4jNode = false;
            let updatedExistingNodeTags = false;
            let rootNodeIdForContext = null;
            let finalSummaryMessage;
            let initialDisciplinaryTagsForContext;
            if (!initialQuery || typeof initialQuery !== 'string') {
                const errorMessage = "Invalid initial query. It must be a non-empty string.";
                logger.error(errorMessage);
                return new baseStage_1.StageOutput(false, errorMessage, { [this.stageName]: { error: errorMessage } }, errorMessage, {
                    nodes_created_in_neo4j: 0,
                    used_existing_neo4j_node: false,
                    updated_existing_node_tags: false,
                });
            }
            logger.info(`Attempting to find or create ROOT node in Neo4j for query: ${initialQuery.substring(0, 100)}...`);
            try {
                const findRootQuery = `
        MATCH (n:ROOT)
        WHERE n.metadata_query_context = $initial_query
        RETURN n.id AS nodeId, n.metadata_disciplinary_tags AS current_tags
        LIMIT 1
      `;
                const rootNodeRecords = yield (0, neo4jUtils_1.executeQuery)(findRootQuery, { initial_query: initialQuery }, "read");
                if (rootNodeRecords && rootNodeRecords.length > 0) {
                    const rootRecord = rootNodeRecords[0];
                    rootNodeIdForContext = rootRecord.nodeId;
                    usedExistingNeo4jNode = true;
                    logger.info(`Found existing ROOT node '${rootNodeIdForContext}' in Neo4j matching query.`);
                    const currentTagsFromDb = new Set(rootRecord.current_tags || []);
                    const newlyProvidedTags = new Set(operationalParams.initial_disciplinary_tags || []);
                    const combinedTags = new Set([...currentTagsFromDb, ...newlyProvidedTags]);
                    if (combinedTags.size !== currentTagsFromDb.size || ![...combinedTags].every(tag => currentTagsFromDb.has(tag))) {
                        const updateTagsQuery = `
            MATCH (n:ROOT {id: $node_id})
            SET n.metadata_disciplinary_tags = $tags
            RETURN n.metadata_disciplinary_tags AS updated_tags
          `;
                        const updatedTagsResult = yield (0, neo4jUtils_1.executeQuery)(updateTagsQuery, {
                            node_id: rootNodeIdForContext,
                            tags: Array.from(combinedTags),
                        }, "write");
                        if (updatedTagsResult && updatedTagsResult.length > 0 && updatedTagsResult[0].updated_tags) {
                            logger.info(`Updated disciplinary tags for ROOT node '${rootNodeIdForContext}' to: ${updatedTagsResult[0].updated_tags}`);
                            updatedExistingNodeTags = true;
                            initialDisciplinaryTagsForContext = Array.from(combinedTags);
                        }
                        else {
                            logger.warn(`Failed to update tags for ROOT node '${rootNodeIdForContext}'. Using existing tags.`);
                            initialDisciplinaryTagsForContext = Array.from(currentTagsFromDb);
                        }
                    }
                    else {
                        logger.info(`No change in disciplinary tags for existing ROOT node '${rootNodeIdForContext}'.`);
                        initialDisciplinaryTagsForContext = Array.from(currentTagsFromDb);
                    }
                    finalSummaryMessage = `Using existing ROOT node '${rootNodeIdForContext}' from Neo4j. Disciplinary tags ensured.`;
                }
                else { // No existing ROOT node found, create one
                    logger.info("No existing ROOT node found in Neo4j. Creating a new one.");
                    const newRootNodeIdInternal = (0, uuid_1.v4)();
                    const defaultDisciplines = new Set(operationalParams.initial_disciplinary_tags ||
                        (((_a = this.settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.default_disciplinary_tags) || []));
                    initialDisciplinaryTagsForContext = Array.from(defaultDisciplines);
                    const rootMetadata = {
                        description: `Initial understanding of the task based on the query: '${initialQuery}'.`,
                        query_context: initialQuery,
                        source_description: "Core GoT Protocol Definition (P1.1), User Query",
                        epistemic_status: common_1.EpistemicStatus.ASSUMPTION,
                        disciplinary_tags: initialDisciplinaryTagsForContext.join(','), // Storing as comma-separated string
                        layer_id: operationalParams.initial_layer || this.initialLayer,
                        impact_score: 0.9,
                        id: (0, uuid_1.v4)(), // This will be overwritten by the Node constructor
                        doi: '',
                        authors: '',
                        publication_date: '',
                        revision_history: [],
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    const rootNode = {
                        id: newRootNodeIdInternal,
                        label: this.rootNodeLabel,
                        type: graphElements_1.NodeType.ROOT,
                        confidence: common_1.ConfidenceVectorSchema.parse({
                            empirical_support: this.initialConfidenceValues[0],
                            theoretical_basis: this.initialConfidenceValues[1],
                            methodological_rigor: this.initialConfidenceValues[2],
                            consensus_alignment: this.initialConfidenceValues[3],
                        }),
                        metadata: rootMetadata,
                        created_at: new Date(),
                        updated_at: new Date(),
                        updateConfidence: () => { }, // Placeholder
                    };
                    const nodePropsForNeo4j = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(rootNode);
                    const typeLabelValue = graphElements_1.NodeType.ROOT.valueOf();
                    const createQuery = `
          MERGE (n:Node {id: $props.id})
          SET n += $props
          WITH n, $type_label AS typeLabel CALL apoc.create.addLabels(n, [typeLabel]) YIELD node
          RETURN node.id AS new_node_id
        `;
                    const queryParams = {
                        props: nodePropsForNeo4j,
                        type_label: typeLabelValue,
                    };
                    const creationResult = yield (0, neo4jUtils_1.executeQuery)(createQuery, queryParams, "write");
                    if (creationResult && creationResult.length > 0 && creationResult[0].new_node_id) {
                        rootNodeIdForContext = creationResult[0].new_node_id;
                        nodesCreatedInNeo4j = 1;
                        logger.info(`New ROOT node '${rootNodeIdForContext}' created in Neo4j.`);
                        finalSummaryMessage = (`New ROOT node '${rootNodeIdForContext}' created in Neo4j.`);
                    }
                    else {
                        const errorMessage = "Failed to create or verify new ROOT node in Neo4j.";
                        logger.error(`${errorMessage} Query: ${createQuery}, Params: ${JSON.stringify(queryParams)}`);
                        // Return error StageOutput
                        return new baseStage_1.StageOutput(false, errorMessage, { [this.stageName]: { error: errorMessage } }, errorMessage, {
                            nodes_created_in_neo4j: 0,
                            used_existing_neo4j_node: false,
                            updated_existing_node_tags: false,
                        });
                    }
                }
            }
            catch (error) {
                const errorMessage = `Neo4j error during ROOT node initialization: ${error.message}`;
                logger.error(errorMessage, error);
                return new baseStage_1.StageOutput(false, errorMessage, { [this.stageName]: { error: errorMessage } }, errorMessage, {
                    nodes_created_in_neo4j: 0,
                    used_existing_neo4j_node: false,
                    updated_existing_node_tags: false,
                });
            }
            if (!rootNodeIdForContext) {
                const errorMessage = ("Critical error: No root_node_id established after Neo4j operations.");
                logger.error(errorMessage);
                return new baseStage_1.StageOutput(false, errorMessage, { [this.stageName]: { error: errorMessage } }, errorMessage, {
                    nodes_created_in_neo4j: nodesCreatedInNeo4j,
                    used_existing_neo4j_node: usedExistingNeo4jNode,
                    updated_existing_node_tags: updatedExistingNodeTags,
                });
            }
            const contextUpdate = {
                root_node_id: rootNodeIdForContext,
                initial_disciplinary_tags: initialDisciplinaryTagsForContext,
            };
            const initialConfidenceAvgMetric = 0.0; // Placeholder
            const metrics = {
                nodes_created_in_neo4j: nodesCreatedInNeo4j,
                used_existing_neo4j_node: usedExistingNeo4jNode,
                updated_existing_node_tags: updatedExistingNodeTags,
                initial_confidence_avg: initialConfidenceAvgMetric,
            };
            const output = new baseStage_1.StageOutput(true, finalSummaryMessage, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.InitializationStage = InitializationStage;
InitializationStage.STAGE_NAME = "InitializationStage";
