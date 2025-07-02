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
exports.SubgraphExtractionStage = exports.ExtractedSubgraphDataSchema = exports.SubgraphCriterionSchema = void 0;
const zod_1 = require("zod");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const baseStage_1 = require("./baseStage");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
exports.SubgraphCriterionSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    min_avg_confidence: zod_1.z.number().min(0.0).max(1.0).optional(),
    min_impact_score: zod_1.z.number().min(0.0).max(1.0).optional(),
    node_types: zod_1.z.array(zod_1.z.nativeEnum(graphElements_1.NodeType)).optional(),
    include_disciplinary_tags: zod_1.z.array(zod_1.z.string()).optional(),
    exclude_disciplinary_tags: zod_1.z.array(zod_1.z.string()).optional(),
    layer_ids: zod_1.z.array(zod_1.z.string()).optional(),
    is_knowledge_gap: zod_1.z.boolean().optional(),
    include_neighbors_depth: zod_1.z.number().int().min(0).default(0),
});
exports.ExtractedSubgraphDataSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    nodes: zod_1.z.array(zod_1.z.record(zod_1.z.any())),
    relationships: zod_1.z.array(zod_1.z.record(zod_1.z.any())),
    metrics: zod_1.z.record(zod_1.z.any()),
});
class SubgraphExtractionStage extends baseStage_1.BaseStage {
    constructor(settings) {
        var _a, _b;
        super(settings);
        this.stageName = "SubgraphExtractionStage";
        this.defaultExtractionCriteria = [
            exports.SubgraphCriterionSchema.parse({
                name: "high_confidence_core",
                description: "Nodes with high average confidence and impact.",
                min_avg_confidence: ((_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.subgraph_min_confidence_threshold) || 0.6,
                min_impact_score: ((_b = settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.subgraph_min_impact_threshold) || 0.6,
                node_types: [
                    graphElements_1.NodeType.HYPOTHESIS,
                    graphElements_1.NodeType.EVIDENCE,
                    graphElements_1.NodeType.INTERDISCIPLINARY_BRIDGE,
                ],
                include_neighbors_depth: 1,
            }),
            exports.SubgraphCriterionSchema.parse({
                name: "key_hypotheses_and_support",
                description: "Key hypotheses and their direct support.",
                node_types: [graphElements_1.NodeType.HYPOTHESIS],
                min_avg_confidence: 0.5,
                min_impact_score: 0.5,
                include_neighbors_depth: 1,
            }),
            exports.SubgraphCriterionSchema.parse({
                name: "knowledge_gaps_focus",
                description: "Identified knowledge gaps.",
                is_knowledge_gap: true,
                node_types: [graphElements_1.NodeType.PLACEHOLDER_GAP, graphElements_1.NodeType.RESEARCH_QUESTION],
                include_neighbors_depth: 1,
            }),
        ];
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    _buildCypherConditionsForCriterion(criterion, params) {
        const conditions = [];
        if (criterion.min_avg_confidence !== undefined) {
            conditions.push("(n.confidence_overall_avg >= $min_avg_confidence OR n.confidence_empirical_support >= $min_avg_confidence)");
            params.min_avg_confidence = criterion.min_avg_confidence;
        }
        if (criterion.min_impact_score !== undefined) {
            conditions.push("n.metadata_impact_score >= $min_impact_score");
            params.min_impact_score = criterion.min_impact_score;
        }
        if (criterion.node_types && criterion.node_types.length > 0) {
            const labelConditions = criterion.node_types.map(nt => `n:${nt}`);
            conditions.push(`(${labelConditions.join(" OR ")})`);
        }
        if (criterion.layer_ids && criterion.layer_ids.length > 0) {
            conditions.push("n.metadata_layer_id IN $layer_ids");
            params.layer_ids = criterion.layer_ids;
        }
        if (criterion.is_knowledge_gap !== undefined) {
            conditions.push("n.metadata_is_knowledge_gap = $is_knowledge_gap");
            params.is_knowledge_gap = criterion.is_knowledge_gap;
        }
        if (criterion.include_disciplinary_tags && criterion.include_disciplinary_tags.length > 0) {
            const tagConditions = [];
            criterion.include_disciplinary_tags.forEach((tag, i) => {
                const paramName = `incl_tag_${i}`;
                tagConditions.push(`$${paramName} IN n.metadata_disciplinary_tags`);
                params[paramName] = tag;
            });
            if (tagConditions.length > 0) {
                conditions.push(`(${tagConditions.join(" OR ")})`);
            }
        }
        if (criterion.exclude_disciplinary_tags && criterion.exclude_disciplinary_tags.length > 0) {
            const tagConditions = [];
            criterion.exclude_disciplinary_tags.forEach((tag, i) => {
                const paramName = `excl_tag_${i}`;
                tagConditions.push(`NOT ($${paramName} IN n.metadata_disciplinary_tags)`);
                params[paramName] = tag;
            });
            if (tagConditions.length > 0) {
                conditions.push(`(${tagConditions.join(" AND ")})`);
            }
        }
        return conditions;
    }
    _formatNeo4jNode(neo4jNodeMap) {
        if ("properties" in neo4jNodeMap &&
            "id" in neo4jNodeMap &&
            "labels" in neo4jNodeMap) {
            return {
                id: neo4jNodeMap.id,
                labels: neo4jNodeMap.labels,
                properties: neo4jNodeMap.properties,
            };
        }
        const propsCopy = Object.assign({}, neo4jNodeMap);
        const nodeId = propsCopy.id;
        delete propsCopy.id;
        const labels = propsCopy.labels || ["Node"]; // Default if no labels field
        delete propsCopy.labels;
        return { id: nodeId, labels: labels, properties: propsCopy };
    }
    _formatNeo4jRelationship(neo4jRelMap) {
        if ("properties" in neo4jRelMap &&
            "id" in neo4jRelMap && // Assuming 'id' is the property name for relationship ID
            "type" in neo4jRelMap &&
            "start" in neo4jRelMap && // Neo4j driver returns start/end node elementIds
            "end" in neo4jRelMap) {
            return {
                id: neo4jRelMap.id,
                type: neo4jRelMap.type,
                source_id: neo4jRelMap.start, // Map to our source_id
                target_id: neo4jRelMap.end, // Map to our target_id
                properties: neo4jRelMap.properties,
            };
        }
        const propsCopy = Object.assign({}, neo4jRelMap);
        const relId = propsCopy.id;
        delete propsCopy.id;
        const relType = propsCopy.type || "RELATED_TO";
        delete propsCopy.type;
        const sourceId = propsCopy.source_id;
        delete propsCopy.source_id;
        const targetId = propsCopy.target_id;
        delete propsCopy.target_id;
        return {
            id: relId,
            type: relType,
            source_id: sourceId,
            target_id: targetId,
            properties: propsCopy,
        };
    }
    _extractSingleSubgraphFromNeo4j(criterion) {
        return __awaiter(this, void 0, void 0, function* () {
            const seedNodeIds = new Set();
            const params = {};
            const conditions = this._buildCypherConditionsForCriterion(criterion, params);
            const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
            const seedQuery = `MATCH (n:Node) ${whereClause} RETURN n.id AS id`;
            const extractedNodesDict = {};
            const extractedRelsDict = {};
            try {
                const seedResults = yield (0, neo4jUtils_1.executeQuery)(seedQuery, params, "read");
                if (seedResults) {
                    seedResults.forEach((record) => {
                        if (record.id) {
                            seedNodeIds.add(record.id);
                        }
                    });
                }
                if (seedNodeIds.size === 0) {
                    logger.info(`No seed nodes found for criterion '${criterion.name}'.`);
                    return exports.ExtractedSubgraphDataSchema.parse({
                        name: criterion.name,
                        description: criterion.description,
                        nodes: [],
                        relationships: [],
                        metrics: {
                            node_count: 0,
                            relationship_count: 0,
                            seed_node_count: 0,
                        },
                    });
                }
                logger.debug(`Found ${seedNodeIds.size} seed nodes for '${criterion.name}'. Expanding with depth ${criterion.include_neighbors_depth}.`);
                const batchApocQuery = `
        MATCH (n:Node) WHERE n.id IN $seed_ids
        CALL apoc.path.subgraphNodes(n, {maxLevel: $max_level}) YIELD node
        WITH collect(node) AS subgraph_nodes
        UNWIND subgraph_nodes AS sn
        OPTIONAL MATCH (sn)-[r]-(other_node)
        WHERE other_node IN subgraph_nodes
        RETURN [n_obj IN subgraph_nodes | {id: n_obj.id, labels: labels(n_obj), properties: properties(n_obj)}] AS final_nodes,
               collect(DISTINCT {id: r.id, type: type(r), start: startNode(r).id, end: endNode(r).id, properties: properties(r)}) AS final_relationships
      `;
                const subgraphResults = yield (0, neo4jUtils_1.executeQuery)(batchApocQuery, {
                    seed_ids: Array.from(seedNodeIds),
                    max_level: criterion.include_neighbors_depth,
                }, "read");
                if (subgraphResults && subgraphResults.length > 0 && subgraphResults[0]) {
                    const rawNodes = subgraphResults[0].final_nodes || [];
                    const rawRels = subgraphResults[0].final_relationships || [];
                    for (const nodeMap of rawNodes) {
                        const fmtNode = this._formatNeo4jNode(nodeMap);
                        if (fmtNode.id) {
                            extractedNodesDict[fmtNode.id] = fmtNode;
                        }
                    }
                    for (const relMap of rawRels) {
                        const fmtRel = this._formatNeo4jRelationship(relMap);
                        if (fmtRel.id) {
                            extractedRelsDict[fmtRel.id] = fmtRel;
                        }
                    }
                }
            }
            catch (error) {
                logger.error(`Neo4j error extracting subgraph for criterion '${criterion.name}': ${error.message}`, error);
            }
            const finalNodesList = Object.values(extractedNodesDict);
            const finalRelsList = Object.values(extractedRelsDict);
            logger.info(`Extracted subgraph '${criterion.name}' with ${finalNodesList.length} nodes and ${finalRelsList.length} relationships from Neo4j.`);
            return exports.ExtractedSubgraphDataSchema.parse({
                name: criterion.name,
                description: criterion.description,
                nodes: finalNodesList,
                relationships: finalRelsList,
                metrics: {
                    node_count: finalNodesList.length,
                    relationship_count: finalRelsList.length,
                    seed_node_count: seedNodeIds.size,
                },
            });
        });
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logStart(currentSessionData.session_id);
            const operationalParams = currentSessionData.accumulated_context.operational_params || {};
            const customCriteriaInput = operationalParams.subgraph_extraction_criteria;
            let criteriaToUse = [];
            if (Array.isArray(customCriteriaInput) && customCriteriaInput.every(c => typeof c === 'object' && c !== null)) {
                try {
                    criteriaToUse = customCriteriaInput.map(c => exports.SubgraphCriterionSchema.parse(c));
                    logger.info(`Using ${criteriaToUse.length} custom subgraph extraction criteria.`);
                }
                catch (error) {
                    logger.warn(`Failed to parse custom subgraph criteria: ${error.message}. Using default criteria.`);
                    criteriaToUse = this.defaultExtractionCriteria;
                }
            }
            else {
                criteriaToUse = this.defaultExtractionCriteria;
                logger.info(`Using ${criteriaToUse.length} default subgraph extraction criteria.`);
            }
            const allExtractedSubgraphsData = [];
            for (const criterion of criteriaToUse) {
                try {
                    const subgraphData = yield this._extractSingleSubgraphFromNeo4j(criterion);
                    if (subgraphData.nodes.length > 0) { // Only add if non-empty
                        allExtractedSubgraphsData.push(subgraphData);
                    }
                }
                catch (error) {
                    logger.error(`Error processing criterion '${criterion.name}': ${error.message}`, error);
                    continue;
                }
            }
            const summary = `Subgraph extraction complete. Extracted ${allExtractedSubgraphsData.length} subgraphs based on ${criteriaToUse.length} criteria.`;
            const totalNodesExtracted = allExtractedSubgraphsData.reduce((sum, sg) => sum + (sg.metrics.node_count || 0), 0);
            const totalRelsExtracted = allExtractedSubgraphsData.reduce((sum, sg) => sum + (sg.metrics.relationship_count || 0), 0);
            const metrics = {
                subgraphs_extracted_count: allExtractedSubgraphsData.length,
                total_criteria_evaluated: criteriaToUse.length,
                total_nodes_in_extracted_subgraphs: totalNodesExtracted,
                total_relationships_in_extracted_subgraphs: totalRelsExtracted,
            };
            for (const sgData of allExtractedSubgraphsData) {
                metrics[`subgraph_${sgData.name}_node_count`] = sgData.metrics.node_count || 0;
                metrics[`subgraph_${sgData.name}_relationship_count`] = sgData.metrics.relationship_count || 0;
            }
            const contextUpdate = {
                subgraph_extraction_results: {
                    subgraphs: allExtractedSubgraphsData.map(sg => sg),
                },
            };
            const output = new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.SubgraphExtractionStage = SubgraphExtractionStage;
