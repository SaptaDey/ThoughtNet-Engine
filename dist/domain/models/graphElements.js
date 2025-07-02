"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGraph = exports.GraphSchema = exports.GraphElementSchema = exports.HyperedgeSchema = exports.HyperedgeMetadataSchema = exports.EdgeSchema = exports.EdgeMetadataSchema = exports.createNode = exports.NodeSchema = exports.NodeMetadataSchema = exports.AttributionSchema = exports.CausalMetadataSchema = exports.StatisticalPowerSchema = exports.InformationTheoreticMetricsSchema = exports.TemporalMetadataSchema = exports.InterdisciplinaryInfoSchema = exports.PlanSchema = exports.BiasFlagSchema = exports.FalsificationCriteriaSchema = exports.EdgeType = exports.NodeType = void 0;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const common_1 = require("./common");
// --- Enumerations ---
var NodeType;
(function (NodeType) {
    NodeType["ROOT"] = "root";
    NodeType["TASK_UNDERSTANDING"] = "task_understanding";
    NodeType["DECOMPOSITION_DIMENSION"] = "decomposition_dimension";
    NodeType["HYPOTHESIS"] = "hypothesis";
    NodeType["EVIDENCE"] = "evidence";
    NodeType["PLACEHOLDER_GAP"] = "placeholder_gap";
    NodeType["INTERDISCIPLINARY_BRIDGE"] = "interdisciplinary_bridge";
    NodeType["RESEARCH_QUESTION"] = "research_question";
    NodeType["HYPEREDGE_CENTER"] = "hyperedge_center";
})(NodeType || (exports.NodeType = NodeType = {}));
var EdgeType;
(function (EdgeType) {
    EdgeType["DECOMPOSITION_OF"] = "decomposition_of";
    EdgeType["GENERATES_HYPOTHESIS"] = "generates_hypothesis";
    EdgeType["HAS_SUBQUESTION"] = "has_subquestion";
    EdgeType["CORRELATIVE"] = "correlative";
    EdgeType["SUPPORTIVE"] = "supportive";
    EdgeType["CONTRADICTORY"] = "contradictory";
    EdgeType["PREREQUISITE"] = "prerequisite";
    EdgeType["GENERALIZATION"] = "generalization";
    EdgeType["SPECIALIZATION"] = "specialization";
    EdgeType["ASSOCIATIVE"] = "associative";
    EdgeType["EXAMPLE_OF"] = "example_of";
    EdgeType["RELEVANT_TO"] = "relevant_to";
    EdgeType["CAUSES"] = "causes";
    EdgeType["CAUSED_BY"] = "caused_by";
    EdgeType["ENABLES"] = "enables";
    EdgeType["PREVENTS"] = "prevents";
    EdgeType["INFLUENCES_POSITIVELY"] = "influences_positively";
    EdgeType["INFLUENCES_NEGATIVELY"] = "influences_negatively";
    EdgeType["COUNTERFACTUAL_TO"] = "counterfactual_to";
    EdgeType["CONFOUNDED_BY"] = "confounded_by";
    EdgeType["TEMPORAL_PRECEDES"] = "temporal_precedes";
    EdgeType["TEMPORAL_FOLLOWS"] = "temporal_follows";
    EdgeType["COOCCURS_WITH"] = "cooccurs_with";
    EdgeType["OVERLAPS_WITH"] = "overlaps_with";
    EdgeType["CYCLIC_RELATIONSHIP"] = "cyclic_relationship";
    EdgeType["DELAYED_EFFECT_OF"] = "delayed_effect_of";
    EdgeType["SEQUENTIAL_DEPENDENCY"] = "sequential_dependency";
    EdgeType["IBN_SOURCE_LINK"] = "ibn_source_link";
    EdgeType["IBN_TARGET_LINK"] = "ibn_target_link";
    EdgeType["HYPEREDGE_COMPONENT"] = "hyperedge_component";
    EdgeType["OTHER"] = "other";
})(EdgeType || (exports.EdgeType = EdgeType = {}));
// --- Metadata models ---
exports.FalsificationCriteriaSchema = zod_1.z.object({
    description: zod_1.z.string(),
    testable_conditions: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.BiasFlagSchema = zod_1.z.object({
    bias_type: zod_1.z.string(),
    description: zod_1.z.string().default(''),
    assessment_stage_id: zod_1.z.string().default(''),
    mitigation_suggested: zod_1.z.string().default(''),
    severity: zod_1.z.string().default('low'),
});
exports.PlanSchema = zod_1.z.object({
    type: zod_1.z.string(),
    description: zod_1.z.string(),
    estimated_cost: zod_1.z.number().default(0.0),
    estimated_duration: zod_1.z.number().default(0.0),
    required_resources: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.InterdisciplinaryInfoSchema = zod_1.z.object({
    source_disciplines: zod_1.z.array(zod_1.z.string()).default([]),
    target_disciplines: zod_1.z.array(zod_1.z.string()).default([]),
    bridging_concept: zod_1.z.string().default(''),
});
exports.TemporalMetadataSchema = zod_1.z.object({
    start_time: zod_1.z.string().default(''),
    end_time: zod_1.z.string().default(''),
    duration_seconds: zod_1.z.number().default(0.0),
    delay_seconds: zod_1.z.number().default(0.0),
    pattern_type: zod_1.z.string().default(''),
});
exports.InformationTheoreticMetricsSchema = zod_1.z.object({
    entropy: zod_1.z.number().default(0.0),
    information_gain: zod_1.z.number().default(0.0),
    kl_divergence_from_prior: zod_1.z.number().default(0.0),
});
exports.StatisticalPowerSchema = zod_1.z.object({
    value: common_1.CertaintyScoreSchema.default(0.8),
    sample_size: zod_1.z.number().int().default(0),
    effect_size: zod_1.z.number().default(0.0),
    p_value: zod_1.z.number().default(0.0),
    confidence_interval: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()]).default([0.0, 1.0]),
    method_description: zod_1.z.string().default(''),
});
exports.CausalMetadataSchema = zod_1.z.object({
    description: zod_1.z.string().default(''),
    causal_strength: zod_1.z.number().default(0.0),
    evidence_source: zod_1.z.string().default(''),
});
exports.AttributionSchema = zod_1.z.object({
    source_id: zod_1.z.string().default(''),
    contributor: zod_1.z.string().default(''),
    timestamp: zod_1.z.string().default(''),
    role: zod_1.z.string().default('author'),
});
// --- Core graph element models ---
exports.NodeMetadataSchema = common_1.TimestampedModelSchema.extend({
    description: zod_1.z.string().default(''),
    query_context: zod_1.z.string().default(''),
    source_description: zod_1.z.string().default(''),
    epistemic_status: zod_1.z.nativeEnum(common_1.EpistemicStatus).default(common_1.EpistemicStatus.UNKNOWN),
    disciplinary_tags: zod_1.z.string().default(''),
    layer_id: zod_1.z.string().default(''),
    impact_score: zod_1.z.number().default(0.1),
    is_knowledge_gap: zod_1.z.boolean().default(false),
    id: zod_1.z.string().uuid().default(() => (0, crypto_1.randomUUID)()),
    doi: zod_1.z.string().default(''),
    authors: zod_1.z.string().default(''),
    publication_date: zod_1.z.string().default(''),
    revision_history: zod_1.z.array(common_1.RevisionRecordSchema).default([]),
});
exports.NodeSchema = common_1.TimestampedModelSchema.extend({
    id: zod_1.z.string().uuid().default(() => (0, crypto_1.randomUUID)()),
    label: zod_1.z.string().default(''),
    type: zod_1.z.nativeEnum(NodeType).default(NodeType.HYPOTHESIS),
    confidence: common_1.ConfidenceVectorSchema.default({}),
    metadata: exports.NodeMetadataSchema.default({}),
});
const createNode = (data) => {
    const parsed = exports.NodeSchema.parse(data);
    return Object.assign(Object.assign({}, parsed), { updateConfidence(newConfidence, updatedBy, reason) {
            const oldConf = this.confidence;
            this.confidence = newConfidence;
            this.metadata.revision_history.push(common_1.RevisionRecordSchema.parse({
                user_or_process: updatedBy,
                action: "update_confidence",
                changes_made: {
                    confidence: { old: oldConf, new: newConfidence },
                },
                reason: reason,
            }));
            // Update the updated_at timestamp
            this.updated_at = new Date();
        },
        touch() {
            this.updated_at = new Date();
        } });
};
exports.createNode = createNode;
exports.EdgeMetadataSchema = common_1.TimestampedModelSchema.extend({
    description: zod_1.z.string().default(''),
    weight: zod_1.z.number().default(1.0),
});
exports.EdgeSchema = common_1.TimestampedModelSchema.extend({
    id: zod_1.z.string().uuid().default(() => (0, crypto_1.randomUUID)()),
    source_id: zod_1.z.string().default(''),
    target_id: zod_1.z.string().default(''),
    type: zod_1.z.nativeEnum(EdgeType).default(EdgeType.SUPPORTIVE),
    confidence: zod_1.z.number().default(0.7),
    metadata: exports.EdgeMetadataSchema.default({}),
});
exports.HyperedgeMetadataSchema = common_1.TimestampedModelSchema.extend({
    description: zod_1.z.string().default(''),
    relationship_descriptor: zod_1.z.string().default(''),
    layer_id: zod_1.z.string().default(''),
});
exports.HyperedgeSchema = common_1.TimestampedModelSchema.extend({
    id: zod_1.z.string().uuid().default(() => (0, crypto_1.randomUUID)()),
    node_ids: zod_1.z.array(zod_1.z.string()).default([]), // ClassVar[set[str]] is tricky, using array for now
    confidence_vector: zod_1.z.number().default(0.5),
    metadata: exports.HyperedgeMetadataSchema.default({}),
});
exports.GraphElementSchema = zod_1.z.object({
    node_id: zod_1.z.string().uuid(),
    label: zod_1.z.string().max(1000).default(''),
    weight: zod_1.z.number().default(1.0),
});
exports.GraphSchema = zod_1.z.object({
    nodes: zod_1.z.record(zod_1.z.string(), exports.NodeSchema).default({}),
    edges: zod_1.z.array(exports.EdgeSchema).default([]),
});
const createGraph = (data) => {
    const parsed = exports.GraphSchema.parse(data);
    return Object.assign(Object.assign({}, parsed), { addNode(nodeId, kwargs) {
            this.nodes[nodeId] = (0, exports.createNode)(Object.assign({ id: nodeId }, kwargs));
        },
        addEdge(sourceId, targetId, kwargs) {
            this.edges.push(exports.EdgeSchema.parse(Object.assign({ source_id: sourceId, target_id: targetId }, kwargs)));
        },
        hasNode(nodeId) {
            return nodeId in this.nodes;
        },
        hasEdge(sourceId, targetId) {
            return this.edges.some(e => e.source_id === sourceId && e.target_id === targetId);
        } });
};
exports.createGraph = createGraph;
