import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TimestampedModelSchema, CertaintyScoreSchema, ConfidenceVectorSchema, EpistemicStatus, RevisionRecordSchema } from './common';



// --- Enumerations ---
export enum NodeType {
  ROOT = "root",
  TASK_UNDERSTANDING = "task_understanding",
  DECOMPOSITION_DIMENSION = "decomposition_dimension",
  HYPOTHESIS = "hypothesis",
  EVIDENCE = "evidence",
  PLACEHOLDER_GAP = "placeholder_gap",
  INTERDISCIPLINARY_BRIDGE = "interdisciplinary_bridge",
  RESEARCH_QUESTION = "research_question",
  HYPEREDGE_CENTER = "hyperedge_center",
}

export enum EdgeType {
  DECOMPOSITION_OF = "decomposition_of",
  GENERATES_HYPOTHESIS = "generates_hypothesis",
  HAS_SUBQUESTION = "has_subquestion",
  CORRELATIVE = "correlative",
  SUPPORTIVE = "supportive",
  CONTRADICTORY = "contradictory",
  PREREQUISITE = "prerequisite",
  GENERALIZATION = "generalization",
  SPECIALIZATION = "specialization",
  ASSOCIATIVE = "associative",
  EXAMPLE_OF = "example_of",
  RELEVANT_TO = "relevant_to",
  CAUSES = "causes",
  CAUSED_BY = "caused_by",
  ENABLES = "enables",
  PREVENTS = "prevents",
  INFLUENCES_POSITIVELY = "influences_positively",
  INFLUENCES_NEGATIVELY = "influences_negatively",
  COUNTERFACTUAL_TO = "counterfactual_to",
  CONFOUNDED_BY = "confounded_by",
  TEMPORAL_PRECEDES = "temporal_precedes",
  TEMPORAL_FOLLOWS = "temporal_follows",
  COOCCURS_WITH = "cooccurs_with",
  OVERLAPS_WITH = "overlaps_with",
  CYCLIC_RELATIONSHIP = "cyclic_relationship",
  DELAYED_EFFECT_OF = "delayed_effect_of",
  SEQUENTIAL_DEPENDENCY = "sequential_dependency",
  IBN_SOURCE_LINK = "ibn_source_link",
  IBN_TARGET_LINK = "ibn_target_link",
  HYPEREDGE_COMPONENT = "hyperedge_component",
  OTHER = "other",
}

// --- Metadata models ---
export const FalsificationCriteriaSchema = z.object({
  description: z.string(),
  testable_conditions: z.array(z.string()).default([]),
});

export type FalsificationCriteria = z.infer<typeof FalsificationCriteriaSchema>;

export const BiasFlagSchema = z.object({
  bias_type: z.string(),
  description: z.string().default(''),
  assessment_stage_id: z.string().default(''),
  mitigation_suggested: z.string().default(''),
  severity: z.string().default('low'),
});

export type BiasFlag = z.infer<typeof BiasFlagSchema>;



export const PlanSchema = z.object({
  type: z.string(),
  description: z.string(),
  estimated_cost: z.number().default(0.0),
  estimated_duration: z.number().default(0.0),
  required_resources: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanSchema>;

export const InterdisciplinaryInfoSchema = z.object({
  source_disciplines: z.array(z.string()).default([]),
  target_disciplines: z.array(z.string()).default([]),
  bridging_concept: z.string().default(''),
});

export type InterdisciplinaryInfo = z.infer<typeof InterdisciplinaryInfoSchema>;

export const TemporalMetadataSchema = z.object({
  start_time: z.string().default(''),
  end_time: z.string().default(''),
  duration_seconds: z.number().default(0.0),
  delay_seconds: z.number().default(0.0),
  pattern_type: z.string().default(''),
});

export type TemporalMetadata = z.infer<typeof TemporalMetadataSchema>;

export const InformationTheoreticMetricsSchema = z.object({
  entropy: z.number().default(0.0),
  information_gain: z.number().default(0.0),
  kl_divergence_from_prior: z.number().default(0.0),
});

export type InformationTheoreticMetrics = z.infer<typeof InformationTheoreticMetricsSchema>;

export const StatisticalPowerSchema = z.object({
  value: CertaintyScoreSchema.default(0.8),
  sample_size: z.number().int().default(0),
  effect_size: z.number().default(0.0),
  p_value: z.number().default(0.0),
  confidence_interval: z.tuple([z.number(), z.number()]).default([0.0, 1.0]),
  method_description: z.string().default(''),
});

export type StatisticalPower = z.infer<typeof StatisticalPowerSchema>;

export const CausalMetadataSchema = z.object({
  description: z.string().default(''),
  causal_strength: z.number().default(0.0),
  evidence_source: z.string().default(''),
});

export type CausalMetadata = z.infer<typeof CausalMetadataSchema>;

export const AttributionSchema = z.object({
  source_id: z.string().default(''),
  contributor: z.string().default(''),
  timestamp: z.string().default(''),
  role: z.string().default('author'),
});

export type Attribution = z.infer<typeof AttributionSchema>;

// --- Core graph element models ---
export const NodeMetadataSchema = TimestampedModelSchema.extend({
  description: z.string().default(''),
  query_context: z.string().default(''),
  source_description: z.string().default(''),
  epistemic_status: z.nativeEnum(EpistemicStatus).default(EpistemicStatus.UNKNOWN),
  disciplinary_tags: z.string().default(''),
  layer_id: z.string().default(''),
  impact_score: z.number().default(0.1),
  is_knowledge_gap: z.boolean().default(false),
  id: z.string().uuid().default(() => randomUUID()),
  doi: z.string().default(''),
  authors: z.string().default(''),
  publication_date: z.string().default(''),
  revision_history: z.array(RevisionRecordSchema).default([]),
});

export type NodeMetadata = z.infer<typeof NodeMetadataSchema>;

export const NodeSchema = TimestampedModelSchema.extend({
  id: z.string().uuid().default(() => randomUUID()),
  label: z.string().default(''),
  type: z.nativeEnum(NodeType).default(NodeType.HYPOTHESIS),
  confidence: ConfidenceVectorSchema.default({}),
  metadata: NodeMetadataSchema.default({}),
});

export type Node = z.infer<typeof NodeSchema> & {
  updateConfidence(newConfidence: z.infer<typeof ConfidenceVectorSchema>, updatedBy: string, reason?: string): void;
  touch(): void;
};

export const createNode = (data?: Partial<Node>): Node => {
  const parsed = NodeSchema.parse(data);
  return {
    ...parsed,
    updateConfidence(newConfidence: z.infer<typeof ConfidenceVectorSchema>, updatedBy: string, reason?: string): void {
      const oldConf = this.confidence;
      this.confidence = newConfidence;
      this.metadata.revision_history.push(
        RevisionRecordSchema.parse({
          user_or_process: updatedBy,
          action: "update_confidence",
          changes_made: {
            confidence: { old: oldConf, new: newConfidence },
          },
          reason: reason,
        })
      );
      // Update the updated_at timestamp
      this.updated_at = new Date();
    },
    touch(): void {
      this.updated_at = new Date();
    },
  };
};

export const EdgeMetadataSchema = TimestampedModelSchema.extend({
  description: z.string().default(''),
  weight: z.number().default(1.0),
});

export type EdgeMetadata = z.infer<typeof EdgeMetadataSchema>;

export const EdgeSchema = TimestampedModelSchema.extend({
  id: z.string().uuid().default(() => randomUUID()),
  source_id: z.string().default(''),
  target_id: z.string().default(''),
  type: z.nativeEnum(EdgeType).default(EdgeType.SUPPORTIVE),
  confidence: z.number().default(0.7),
  metadata: EdgeMetadataSchema.default({}),
});

export type Edge = z.infer<typeof EdgeSchema>;

export const HyperedgeMetadataSchema = TimestampedModelSchema.extend({
  description: z.string().default(''),
  relationship_descriptor: z.string().default(''),
  layer_id: z.string().default(''),
});

export type HyperedgeMetadata = z.infer<typeof HyperedgeMetadataSchema>;

export const HyperedgeSchema = TimestampedModelSchema.extend({
  id: z.string().uuid().default(() => randomUUID()),
  node_ids: z.array(z.string()).default([]), // ClassVar[set[str]] is tricky, using array for now
  confidence_vector: z.number().default(0.5),
  metadata: HyperedgeMetadataSchema.default({}),
});

export type Hyperedge = z.infer<typeof HyperedgeSchema>;

export const GraphElementSchema = z.object({
  node_id: z.string().uuid(),
  label: z.string().max(1000).default(''),
  weight: z.number().default(1.0),
});

export type GraphElement = z.infer<typeof GraphElementSchema>;

export const GraphSchema = z.object({
  nodes: z.record(z.string(), NodeSchema).default({}),
  edges: z.array(EdgeSchema).default([]),
});

export type Graph = z.infer<typeof GraphSchema> & {
  addNode(nodeId: string, kwargs?: Partial<Node>): void;
  addEdge(sourceId: string, targetId: string, kwargs?: Partial<Edge>): void;
  hasNode(nodeId: string): boolean;
  hasEdge(sourceId: string, targetId: string): boolean;
};

export const createGraph = (data?: Partial<Graph>): Graph => {
  const parsed = GraphSchema.parse(data);
  return {
    ...parsed,
    addNode(nodeId: string, kwargs?: Partial<Node>): void {
      this.nodes[nodeId] = createNode({ id: nodeId, ...kwargs });
    },
    addEdge(sourceId: string, targetId: string, kwargs?: Partial<Edge>): void {
      this.edges.push(EdgeSchema.parse({ source_id: sourceId, target_id: targetId, ...kwargs }));
    },
    hasNode(nodeId: string): boolean {
      return nodeId in this.nodes;
    },
    hasEdge(sourceId: string, targetId: string): boolean {
      return this.edges.some(e => e.source_id === sourceId && e.target_id === targetId);
    },
  };
};