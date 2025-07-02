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
exports.HypothesisStage = void 0;
const uuid_1 = require("uuid");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const common_1 = require("../models/common");
const baseStage_1 = require("./baseStage");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
const neo4jHelpers_1 = require("../utils/neo4jHelpers");
const decompositionStage_1 = require("./decompositionStage");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class HypothesisStage extends baseStage_1.BaseStage {
    constructor(settings) {
        var _a, _b, _c, _d, _e, _f, _g;
        super(settings);
        this.stageName = HypothesisStage.STAGE_NAME;
        this.kMinHypotheses = ((_b = (_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.hypotheses_per_dimension) === null || _b === void 0 ? void 0 : _b.min_hypotheses) || 1;
        this.kMaxHypotheses = ((_d = (_c = settings.asr_got.default_parameters) === null || _c === void 0 ? void 0 : _c.hypotheses_per_dimension) === null || _d === void 0 ? void 0 : _d.max_hypotheses) || 3;
        this.hypothesisConfidenceValues = ((_e = settings.asr_got.default_parameters) === null || _e === void 0 ? void 0 : _e.hypothesis_confidence) || [0.5, 0.5, 0.5, 0.5];
        this.defaultDisciplinaryTagsConfig = ((_f = settings.asr_got.default_parameters) === null || _f === void 0 ? void 0 : _f.default_disciplinary_tags) || [];
        this.defaultPlanTypesConfig = ((_g = settings.asr_got.default_parameters) === null || _g === void 0 ? void 0 : _g.default_plan_types) || ["Experiment", "Simulation", "Literature Review"];
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    _generateHypothesisContent(dimensionLabel, dimensionTags, hypoIndex, initialQuery) {
        return __awaiter(this, void 0, void 0, function* () {
            const baseHypothesisText = `Hypothesis ${hypoIndex + 1} regarding '${dimensionLabel}' for query '${initialQuery.substring(0, 30)}...'`;
            const planType = this.defaultPlanTypesConfig[Math.floor(Math.random() * this.defaultPlanTypesConfig.length)];
            const plan = graphElements_1.PlanSchema.parse({
                type: planType,
                description: `Plan to evaluate '${baseHypothesisText}' via ${planType}.`,
                estimated_cost: Math.random() * (0.8 - 0.2) + 0.2,
                estimated_duration: Math.random() * (5.0 - 1.0) + 1.0,
                required_resources: [Math.random() < 0.5 ? "dataset_X" : (Math.random() < 0.5 ? "computational_cluster" : "expert_A")],
            });
            const falsConditions = [
                `Observe contradictory evidence from ${planType}`,
                `Find statistical insignificance in ${Math.random() < 0.5 ? 'key_metric_A' : 'key_metric_B'}`,
            ];
            const falsificationCriteria = graphElements_1.FalsificationCriteriaSchema.parse({
                description: `This hypothesis could be falsified if ${falsConditions[0].toLowerCase()} or if ${falsConditions[1].toLowerCase()}.`,
                testable_conditions: falsConditions,
            });
            const biasFlags = [];
            if (Math.random() < 0.15) {
                const biasType = Math.random() < 0.5 ? "Confirmation Bias" : (Math.random() < 0.5 ? "Availability Heuristic" : "Anchoring Bias");
                biasFlags.push(graphElements_1.BiasFlagSchema.parse({
                    bias_type: biasType,
                    description: `Potential ${biasType} in formulating or prioritizing this hypothesis.`,
                    assessment_stage_id: this.stageName,
                    severity: Math.random() < 0.5 ? "low" : "medium",
                }));
            }
            const impactScore = Math.random() * (0.9 - 0.2) + 0.2;
            const numTags = Math.floor(Math.random() * Math.min(2, this.defaultDisciplinaryTagsConfig.length)) + 1;
            const hypoDisciplinaryTags = new Set(this.defaultDisciplinaryTagsConfig.sort(() => 0.5 - Math.random()).slice(0, numTags));
            dimensionTags.forEach(tag => hypoDisciplinaryTags.add(tag));
            return {
                label: baseHypothesisText,
                plan: plan,
                falsification_criteria: falsificationCriteria,
                bias_flags: biasFlags,
                impact_score: impactScore,
                disciplinary_tags: Array.from(hypoDisciplinaryTags),
            };
        });
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this._logStart(currentSessionData.session_id);
            const decompositionData = currentSessionData.accumulated_context[decompositionStage_1.DecompositionStage.STAGE_NAME] || {};
            const dimensionNodeIds = decompositionData.dimension_node_ids || [];
            const initialQuery = currentSessionData.query;
            const operationalParams = currentSessionData.accumulated_context.operational_params || {};
            if (dimensionNodeIds.length === 0) {
                logger.warn("No dimension node IDs found. Skipping hypothesis generation.");
                return new baseStage_1.StageOutput(false, "Hypothesis generation skipped: No dimensions.", { [this.stageName]: { error: "No dimensions found", hypothesis_node_ids: [] } }, "No dimensions found", {
                    hypotheses_created_in_neo4j: 0,
                    relationships_created_in_neo4j: 0,
                });
            }
            const allHypothesisNodeIdsCreated = [];
            let nodesCreatedCount = 0;
            let edgesCreatedCount = 0;
            const batchHypothesisNodeData = [];
            const createdHypothesesMap = {};
            const kMin = operationalParams.hypotheses_per_dimension_min || this.kMinHypotheses;
            const kMax = operationalParams.hypotheses_per_dimension_max || this.kMaxHypotheses;
            for (const dimId of dimensionNodeIds) {
                try {
                    const fetchDimQuery = "MATCH (d:Node {id: $dimension_id}) RETURN properties(d) as props";
                    const dimRecords = yield (0, neo4jUtils_1.executeQuery)(fetchDimQuery, { dimension_id: dimId }, "read");
                    if (!dimRecords || dimRecords.length === 0 || !dimRecords[0].props) {
                        logger.warn(`Dimension node ${dimId} not found. Skipping hypothesis generation for it.`);
                        continue;
                    }
                    const dimProps = dimRecords[0].props;
                    const dimensionLabelForHypo = dimProps.label || "Unknown Dimension";
                    const dimensionTagsForHypo = new Set(Array.isArray(dimProps.metadata_disciplinary_tags)
                        ? dimProps.metadata_disciplinary_tags
                        : (dimProps.metadata_disciplinary_tags || '').split(',').filter(Boolean));
                    const dimensionLayerForHypo = dimProps.metadata_layer_id || ((_a = this.settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.initial_layer) || "0";
                    const kHypothesesToGenerate = Math.floor(Math.random() * (kMax - kMin + 1)) + kMin;
                    logger.debug(`Preparing ${kHypothesesToGenerate} hypotheses for dimension: '${dimensionLabelForHypo}' (ID: ${dimId})`);
                    for (let i = 0; i < kHypothesesToGenerate; i++) {
                        const hypoContent = yield this._generateHypothesisContent(dimensionLabelForHypo, dimensionTagsForHypo, i, initialQuery);
                        const hypoIdNeo4j = `hypo_${dimId}_${currentSessionData.session_id}_${i}_${(0, uuid_1.v4)()}`;
                        const hypoMetadata = {
                            description: `A hypothesis related to dimension: '${dimensionLabelForHypo}'.`,
                            query_context: currentSessionData.query || '',
                            source_description: "HypothesisStage (P1.3)",
                            epistemic_status: common_1.EpistemicStatus.HYPOTHESIS,
                            disciplinary_tags: hypoContent.disciplinary_tags.join(','),
                            impact_score: hypoContent.impact_score,
                            is_knowledge_gap: false,
                            layer_id: operationalParams.hypothesis_layer || dimensionLayerForHypo,
                            id: (0, uuid_1.v4)(), // Will be overwritten by Node constructor
                            doi: '',
                            authors: '',
                            publication_date: '',
                            revision_history: [],
                            created_at: new Date(),
                            updated_at: new Date(),
                        };
                        const hypothesisNode = (0, graphElements_1.createNode)({
                            id: hypoIdNeo4j,
                            label: hypoContent.label,
                            type: graphElements_1.NodeType.HYPOTHESIS,
                            confidence: common_1.ConfidenceVectorSchema.parse({
                                empirical_support: this.hypothesisConfidenceValues[0],
                                theoretical_basis: this.hypothesisConfidenceValues[1],
                                methodological_rigor: this.hypothesisConfidenceValues[2],
                                consensus_alignment: this.hypothesisConfidenceValues[3],
                            }),
                            metadata: hypoMetadata,
                        });
                        const hypPropsForNeo4j = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(hypothesisNode);
                        batchHypothesisNodeData.push({
                            props: hypPropsForNeo4j,
                            type_label_value: graphElements_1.NodeType.HYPOTHESIS.valueOf(),
                            dim_id_source: dimId,
                            hypo_label_original: hypoContent.label,
                        });
                    }
                }
                catch (error) {
                    logger.error(`Neo4j error fetching dimension ${dimId}: ${error.message}. Skipping.`, error);
                }
            }
            if (batchHypothesisNodeData.length > 0) {
                try {
                    const batchNodeQuery = `
          UNWIND $batch_data AS item
          MERGE (h:Node {id: item.props.id}) SET h += item.props
          WITH h, item.type_label_value AS typeLabelValue CALL apoc.create.addLabels(h, [typeLabelValue]) YIELD node
          RETURN node.id AS created_hyp_id, item.dim_id_source AS dim_id_source, item.hypo_label_original AS hypo_label
        `;
                    const resultsNodes = yield (0, neo4jUtils_1.executeQuery)(batchNodeQuery, { batch_data: batchHypothesisNodeData }, "write");
                    for (const record of resultsNodes) {
                        const createdHypId = record.created_hyp_id;
                        const dimIdSource = record.dim_id_source;
                        const hypoLabel = record.hypo_label;
                        allHypothesisNodeIdsCreated.push(createdHypId);
                        nodesCreatedCount++;
                        createdHypothesesMap[createdHypId] = {
                            dim_id: dimIdSource,
                            label: hypoLabel,
                        };
                        logger.debug(`Batch created/merged hypothesis node '${hypoLabel}' (ID: ${createdHypId}) for dimension ${dimIdSource}.`);
                    }
                }
                catch (error) {
                    logger.error(`Neo4j error during batch hypothesis node creation: ${error.message}`, error);
                }
            }
            const batchRelationshipData = [];
            if (Object.keys(createdHypothesesMap).length > 0) {
                for (const createdHypId in createdHypothesesMap) {
                    const hypoDataMap = createdHypothesesMap[createdHypId];
                    const dimIdForRel = hypoDataMap.dim_id;
                    const hypoLabelForRel = hypoDataMap.label;
                    const dimLabelPlaceholder = `Dimension for '${hypoLabelForRel.substring(0, 20)}...'`;
                    const edgeId = `edge_${dimIdForRel}_genhyp_${createdHypId}_${(0, uuid_1.v4)()}`;
                    const edgeMetadata = {
                        description: `Hypothesis '${hypoLabelForRel}' generated for dimension '${dimLabelPlaceholder}'.`,
                        weight: 1.0,
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    const edge = {
                        id: edgeId,
                        source_id: dimIdForRel,
                        target_id: createdHypId,
                        type: graphElements_1.EdgeType.GENERATES_HYPOTHESIS,
                        confidence: 0.95,
                        metadata: edgeMetadata,
                        created_at: new Date(),
                        updated_at: new Date(),
                    };
                    const edgePropsForNeo4j = (0, neo4jHelpers_1.prepareEdgePropertiesForNeo4j)(edge);
                    batchRelationshipData.push({
                        dim_id: dimIdForRel,
                        hyp_id: createdHypId,
                        props: edgePropsForNeo4j,
                    });
                }
            }
            if (batchRelationshipData.length > 0) {
                try {
                    const batchRelQuery = `
          UNWIND $batch_rels AS rel_detail
          MATCH (dim:Node {id: rel_detail.dim_id})
          MATCH (hyp:Node {id: rel_detail.hyp_id})
          MERGE (dim)-[r:GENERATES_HYPOTHESIS {id: rel_detail.props.id}]->(hyp)
          SET r += rel_detail.props
          RETURN count(r) AS total_rels_created
        `;
                    const resultRels = yield (0, neo4jUtils_1.executeQuery)(batchRelQuery, { batch_rels: batchRelationshipData }, "write");
                    if (resultRels && resultRels.length > 0 && resultRels[0].total_rels_created !== undefined) {
                        edgesCreatedCount = resultRels[0].total_rels_created;
                        logger.debug(`Batch created ${edgesCreatedCount} GENERATES_HYPOTHESIS relationships.`);
                    }
                    else {
                        logger.error("Batch relationship creation query did not return expected count.");
                    }
                }
                catch (error) {
                    logger.error(`Neo4j error during batch GENERATES_HYPOTHESIS relationship creation: ${error.message}`, error);
                }
            }
            const summary = `Generated ${nodesCreatedCount} hypotheses in Neo4j across ${dimensionNodeIds.length} dimensions.`;
            const metrics = {
                hypotheses_created_in_neo4j: nodesCreatedCount,
                relationships_created_in_neo4j: edgesCreatedCount,
                avg_hypotheses_per_dimension: dimensionNodeIds.length > 0 ? nodesCreatedCount / dimensionNodeIds.length : 0,
            };
            const hypothesesResultsForContext = allHypothesisNodeIdsCreated.map(hypId => ({
                id: hypId,
                label: createdHypothesesMap[hypId].label,
                dimension_id: createdHypothesesMap[hypId].dim_id,
            }));
            const contextUpdate = {
                hypothesis_node_ids: allHypothesisNodeIdsCreated,
                hypotheses_results: hypothesesResultsForContext,
            };
            return new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
        });
    }
}
exports.HypothesisStage = HypothesisStage;
HypothesisStage.STAGE_NAME = "HypothesisStage";
