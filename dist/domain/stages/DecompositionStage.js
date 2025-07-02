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
exports.DecompositionStage = void 0;
const uuid_1 = require("uuid");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const common_1 = require("../models/common");
const baseStage_1 = require("./baseStage");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
const neo4jHelpers_1 = require("../utils/neo4jHelpers");
const initializationStage_1 = require("./initializationStage");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class DecompositionStage extends baseStage_1.BaseStage {
    constructor(settings) {
        var _a, _b;
        super(settings);
        this.stageName = DecompositionStage.STAGE_NAME;
        this.defaultDimensionsConfig = ((_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.default_decomposition_dimensions) || [];
        this.dimensionConfidenceValues = ((_b = settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.dimension_confidence) || [0.5, 0.5, 0.5, 0.5];
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    _getConceptualDimensions(rootNodeQueryContext, customDimensionsInput) {
        if (customDimensionsInput && Array.isArray(customDimensionsInput)) {
            logger.info("Using custom decomposition dimensions provided in operational parameters.");
            return customDimensionsInput.filter(dim => typeof dim === 'object' && dim !== null && 'label' in dim && 'description' in dim);
        }
        else {
            logger.info("Using default decomposition dimensions from configuration.");
            return this.defaultDimensionsConfig.map((dim) => ({ label: dim.label, description: dim.description }));
        }
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this._logStart(currentSessionData.session_id);
            const initializationData = currentSessionData.accumulated_context[initializationStage_1.InitializationStage.STAGE_NAME] || {};
            const rootNodeId = initializationData.root_node_id;
            const initialDisciplinaryTags = new Set(initializationData.initial_disciplinary_tags || []);
            if (!rootNodeId) {
                const errMsg = "Root node ID not found in session context. Cannot proceed.";
                logger.error(errMsg);
                return new baseStage_1.StageOutput(false, errMsg, { [this.stageName]: { error: errMsg, dimension_node_ids: [] } }, errMsg, {
                    dimensions_created_in_neo4j: 0,
                    relationships_created_in_neo4j: 0,
                });
            }
            let rootNodeInfo;
            try {
                const query = "MATCH (n:Node {id: $root_node_id}) RETURN properties(n) AS props";
                const results = yield (0, neo4jUtils_1.executeQuery)(query, { root_node_id: rootNodeId }, "read");
                if (results && results.length > 0 && results[0].props) {
                    rootNodeInfo = results[0].props;
                }
                else {
                    const errMsg = `Root node ${rootNodeId} not found in Neo4j.`;
                    logger.error(errMsg);
                    return new baseStage_1.StageOutput(false, errMsg, { [this.stageName]: { error: errMsg, dimension_node_ids: [] } }, errMsg, {
                        dimensions_created_in_neo4j: 0,
                        relationships_created_in_neo4j: 0,
                    });
                }
            }
            catch (error) {
                const errMsg = `Neo4j error fetching root node ${rootNodeId}: ${error.message}`;
                logger.error(errMsg, error);
                return new baseStage_1.StageOutput(false, errMsg, { [this.stageName]: { error: errMsg, dimension_node_ids: [] } }, errMsg, {
                    dimensions_created_in_neo4j: 0,
                    relationships_created_in_neo4j: 0,
                });
            }
            const decompositionInputText = (rootNodeInfo === null || rootNodeInfo === void 0 ? void 0 : rootNodeInfo.metadata_query_context) || (rootNodeInfo === null || rootNodeInfo === void 0 ? void 0 : rootNodeInfo.label) || "Root Task";
            const rootNodeLayerStr = (rootNodeInfo === null || rootNodeInfo === void 0 ? void 0 : rootNodeInfo.metadata_layer_id) || ((_a = this.settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.initial_layer) || "0";
            const operationalParams = currentSessionData.accumulated_context.operational_params || {};
            const customDimensionsInput = operationalParams.decomposition_dimensions;
            const dimensionsToCreateConceptual = this._getConceptualDimensions(decompositionInputText, customDimensionsInput);
            const dimensionNodeIdsCreated = [];
            let nodesCreatedCount = 0;
            let edgesCreatedCount = 0;
            const dimensionLabelsCreated = [];
            const batchDimensionNodeData = [];
            const createdDimensionsMap = {};
            for (let i = 0; i < dimensionsToCreateConceptual.length; i++) {
                const dimData = dimensionsToCreateConceptual[i];
                const dimLabel = dimData.label || `Dimension ${i + 1}`;
                const dimDescription = dimData.description || `Details for ${dimLabel}`;
                const originalDimIdentifier = dimData.id || dimLabel;
                const dimIdNeo4j = `dim_${rootNodeId}_${i}_${(0, uuid_1.v4)()}`; // Ensure unique ID
                const dimMetadata = {
                    description: dimDescription,
                    source_description: "DecompositionStage (P1.2)",
                    epistemic_status: common_1.EpistemicStatus.ASSUMPTION,
                    disciplinary_tags: Array.from(initialDisciplinaryTags).join(','),
                    layer_id: operationalParams.dimension_layer || rootNodeLayerStr,
                    impact_score: 0.7,
                    id: (0, uuid_1.v4)(), // Will be overwritten by Node constructor
                    doi: '',
                    authors: '',
                    publication_date: '',
                    revision_history: [],
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                const dimensionNode = {
                    id: dimIdNeo4j,
                    label: dimLabel,
                    type: graphElements_1.NodeType.DECOMPOSITION_DIMENSION,
                    confidence: common_1.ConfidenceVectorSchema.parse({
                        empirical_support: this.dimensionConfidenceValues[0],
                        theoretical_basis: this.dimensionConfidenceValues[1],
                        methodological_rigor: this.dimensionConfidenceValues[2],
                        consensus_alignment: this.dimensionConfidenceValues[3],
                    }),
                    metadata: dimMetadata,
                    created_at: new Date(),
                    updated_at: new Date(),
                    updateConfidence: () => { }, // Placeholder
                };
                const nodePropsForNeo4j = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(dimensionNode);
                const typeLabelValue = graphElements_1.NodeType.DECOMPOSITION_DIMENSION.valueOf();
                batchDimensionNodeData.push({
                    props: nodePropsForNeo4j,
                    type_label_value: typeLabelValue,
                    original_identifier: originalDimIdentifier,
                });
            }
            if (batchDimensionNodeData.length > 0) {
                try {
                    const batchNodeQuery = `
          UNWIND $batch_data AS item
          MERGE (d:Node {id: item.props.id}) SET d += item.props
          WITH d, item.type_label_value AS typeLabelValue CALL apoc.create.addLabels(d, [typeLabelValue]) YIELD node
          RETURN node.id AS created_node_id, item.props.label AS created_label, item.original_identifier AS original_identifier
        `;
                    const resultsNodes = yield (0, neo4jUtils_1.executeQuery)(batchNodeQuery, { batch_data: batchDimensionNodeData }, "write");
                    for (const record of resultsNodes) {
                        const createdNodeId = record.created_node_id;
                        const createdLabel = record.created_label;
                        const originalIdentifier = record.original_identifier;
                        dimensionNodeIdsCreated.push(createdNodeId);
                        dimensionLabelsCreated.push(createdLabel);
                        nodesCreatedCount++;
                        createdDimensionsMap[originalIdentifier] = createdNodeId;
                        logger.debug(`Batch created/merged dimension node '${createdLabel}' (ID: ${createdNodeId}).`);
                    }
                }
                catch (error) {
                    logger.error(`Neo4j error during batch dimension node creation: ${error.message}`, error);
                }
            }
            const batchRelationshipData = [];
            if (dimensionNodeIdsCreated.length > 0) {
                for (let i = 0; i < dimensionsToCreateConceptual.length; i++) {
                    const dimData = dimensionsToCreateConceptual[i];
                    const originalDimIdentifier = dimData.id || dimData.label || `Dimension ${i + 1}`;
                    const createdDimensionId = createdDimensionsMap[originalDimIdentifier];
                    if (!createdDimensionId) {
                        logger.warn(`Could not find created Neo4j ID for original dimension identifier '${originalDimIdentifier}'. Skipping relationship creation.`);
                        continue;
                    }
                    const dimLabelForEdge = dimData.label || `Dimension ${i + 1}`;
                    const edgeId = `edge_${createdDimensionId}_decompof_${rootNodeId}_${(0, uuid_1.v4)()}`;
                    const edgeMetadata = {
                        description: `'${dimLabelForEdge}' is a decomposition of '${decompositionInputText.substring(0, 30)}...'`,
                        weight: 1.0,
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    const edge = {
                        id: edgeId,
                        source_id: createdDimensionId,
                        target_id: rootNodeId,
                        type: graphElements_1.EdgeType.DECOMPOSITION_OF,
                        confidence: 0.95,
                        metadata: edgeMetadata,
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    const edgePropsForNeo4j = (0, neo4jHelpers_1.prepareEdgePropertiesForNeo4j)(edge);
                    batchRelationshipData.push({
                        dim_id: createdDimensionId,
                        root_id: rootNodeId,
                        props: edgePropsForNeo4j,
                    });
                }
            }
            if (batchRelationshipData.length > 0) {
                try {
                    const batchRelQuery = `
          UNWIND $batch_rels AS rel_detail
          MATCH (dim_node:Node {id: rel_detail.dim_id})
          MATCH (root_node:Node {id: rel_detail.root_id})
          MERGE (dim_node)-[r:DECOMPOSITION_OF {id: rel_detail.props.id}]->(root_node)
          SET r += rel_detail.props
          RETURN count(r) AS total_rels_created
        `;
                    const resultRels = yield (0, neo4jUtils_1.executeQuery)(batchRelQuery, { batch_rels: batchRelationshipData }, "write");
                    if (resultRels && resultRels.length > 0 && resultRels[0].total_rels_created !== undefined) {
                        edgesCreatedCount = resultRels[0].total_rels_created;
                        logger.debug(`Batch created ${edgesCreatedCount} DECOMPOSITION_OF relationships.`);
                    }
                    else {
                        logger.error("Batch relationship creation query did not return expected count.");
                    }
                }
                catch (error) {
                    logger.error(`Neo4j error during batch DECOMPOSITION_OF relationship creation: ${error.message}`, error);
                }
            }
            const summary = `Task decomposed into ${nodesCreatedCount} dimensions in Neo4j: ${dimensionLabelsCreated.join(', ')}.`;
            const metrics = {
                dimensions_created_in_neo4j: nodesCreatedCount,
                relationships_created_in_neo4j: edgesCreatedCount,
                avg_hypotheses_per_dimension: dimensionNodeIdsCreated.length > 0 ? nodesCreatedCount / dimensionNodeIdsCreated.length : 0,
            };
            const decompositionResultsForContext = dimensionNodeIdsCreated.map((nodeId, index) => ({
                id: nodeId,
                label: dimensionLabelsCreated[index],
            }));
            const contextUpdate = {
                dimension_node_ids: dimensionNodeIdsCreated,
                decomposition_results: decompositionResultsForContext,
            };
            const output = new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.DecompositionStage = DecompositionStage;
DecompositionStage.STAGE_NAME = "DecompositionStage";
