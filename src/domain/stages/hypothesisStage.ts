import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { Node, NodeMetadata, NodeType, Edge, EdgeMetadata, EdgeType, FalsificationCriteriaSchema, BiasFlagSchema, PlanSchema, createNode } from '../models/graphElements';
import { ConfidenceVectorSchema, EpistemicStatus } from '../models/common';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';
import { prepareNodePropertiesForNeo4j, prepareEdgePropertiesForNeo4j } from '../utils/neo4jHelpers';
import { DecompositionStage } from './decompositionStage';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export class HypothesisStage extends BaseStage {
  static STAGE_NAME: string = "HypothesisStage";
  stageName: string = HypothesisStage.STAGE_NAME;
  private kMinHypotheses: number;
  private kMaxHypotheses: number;
  private hypothesisConfidenceValues: number[];
  private defaultDisciplinaryTagsConfig: string[];
  private defaultPlanTypesConfig: string[];

  constructor(settings: any) {
    super(settings);
    this.kMinHypotheses = settings.asr_got.default_parameters?.hypotheses_per_dimension?.min_hypotheses || 1;
    this.kMaxHypotheses = settings.asr_got.default_parameters?.hypotheses_per_dimension?.max_hypotheses || 3;
    this.hypothesisConfidenceValues = settings.asr_got.default_parameters?.hypothesis_confidence || [0.5, 0.5, 0.5, 0.5];
    this.defaultDisciplinaryTagsConfig = settings.asr_got.default_parameters?.default_disciplinary_tags || [];
    this.defaultPlanTypesConfig = settings.asr_got.default_parameters?.default_plan_types || ["Experiment", "Simulation", "Literature Review"];
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private async _generateHypothesisContent(
    dimensionLabel: string,
    dimensionTags: Set<string>,
    hypoIndex: number,
    initialQuery: string,
  ): Promise<any> {
    const baseHypothesisText = `Hypothesis ${hypoIndex + 1} regarding '${dimensionLabel}' for query '${initialQuery.substring(0, 30)}...'`;
    const planType = this.defaultPlanTypesConfig[Math.floor(Math.random() * this.defaultPlanTypesConfig.length)];
    const plan = PlanSchema.parse({
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
    const falsificationCriteria = FalsificationCriteriaSchema.parse({
      description: `This hypothesis could be falsified if ${falsConditions[0].toLowerCase()} or if ${falsConditions[1].toLowerCase()}.`,
      testable_conditions: falsConditions,
    });

    const biasFlags = [];
    if (Math.random() < 0.15) {
      const biasType = Math.random() < 0.5 ? "Confirmation Bias" : (Math.random() < 0.5 ? "Availability Heuristic" : "Anchoring Bias");
      biasFlags.push(BiasFlagSchema.parse({
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
  }

  async execute(currentSessionData: GoTProcessorSessionData): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);

    const decompositionData = currentSessionData.accumulated_context[DecompositionStage.STAGE_NAME] || {};
    const dimensionNodeIds: string[] = decompositionData.dimension_node_ids || [];
    const initialQuery = currentSessionData.query;
    const operationalParams = currentSessionData.accumulated_context.operational_params || {};

    if (dimensionNodeIds.length === 0) {
      logger.warn("No dimension node IDs found. Skipping hypothesis generation.");
      return new StageOutput(
        false,
        "Hypothesis generation skipped: No dimensions.",
        { [this.stageName]: { error: "No dimensions found", hypothesis_node_ids: [] } },
        "No dimensions found",
        {
          hypotheses_created_in_neo4j: 0,
          relationships_created_in_neo4j: 0,
        }
      );
    }

    const allHypothesisNodeIdsCreated: string[] = [];
    let nodesCreatedCount = 0;
    let edgesCreatedCount = 0;

    const batchHypothesisNodeData: any[] = [];
    const createdHypothesesMap: { [hypothesisId: string]: { dim_id: string; label: string } } = {};

    const kMin = operationalParams.hypotheses_per_dimension_min || this.kMinHypotheses;
    const kMax = operationalParams.hypotheses_per_dimension_max || this.kMaxHypotheses;

    for (const dimId of dimensionNodeIds) {
      try {
        const fetchDimQuery = "MATCH (d:Node {id: $dimension_id}) RETURN properties(d) as props";
        const dimRecords = await executeQuery(fetchDimQuery, { dimension_id: dimId }, "read");
        if (!dimRecords || dimRecords.length === 0 || !dimRecords[0].props) {
          logger.warn(`Dimension node ${dimId} not found. Skipping hypothesis generation for it.`);
          continue;
        }

        const dimProps = dimRecords[0].props;
        const dimensionLabelForHypo = dimProps.label || "Unknown Dimension";
        const dimensionTagsForHypo = new Set<string>(
          Array.isArray(dimProps.metadata_disciplinary_tags) 
            ? dimProps.metadata_disciplinary_tags 
            : (dimProps.metadata_disciplinary_tags || '').split(',').filter(Boolean)
        );
        const dimensionLayerForHypo = dimProps.metadata_layer_id || this.settings.asr_got.default_parameters?.initial_layer || "0";

        const kHypothesesToGenerate = Math.floor(Math.random() * (kMax - kMin + 1)) + kMin;
        logger.debug(`Preparing ${kHypothesesToGenerate} hypotheses for dimension: '${dimensionLabelForHypo}' (ID: ${dimId})`);

        for (let i = 0; i < kHypothesesToGenerate; i++) {
          const hypoContent = await this._generateHypothesisContent(
            dimensionLabelForHypo,
            dimensionTagsForHypo,
            i,
            initialQuery,
          );
          const hypoIdNeo4j = `hypo_${dimId}_${currentSessionData.session_id}_${i}_${uuidv4()}`;

          const hypoMetadata: NodeMetadata = {
            description: `A hypothesis related to dimension: '${dimensionLabelForHypo}'.`,
            query_context: currentSessionData.query || '',
            source_description: "HypothesisStage (P1.3)",
            epistemic_status: EpistemicStatus.HYPOTHESIS,
            disciplinary_tags: hypoContent.disciplinary_tags.join(','),
            impact_score: hypoContent.impact_score,
            is_knowledge_gap: false,
            layer_id: operationalParams.hypothesis_layer || dimensionLayerForHypo,
            id: uuidv4(), // Will be overwritten by Node constructor
            doi: '',
            authors: '',
            publication_date: '',
            revision_history: [],
            created_at: new Date(),
            updated_at: new Date(),
          };

          const hypothesisNode: Node = createNode({
            id: hypoIdNeo4j,
            label: hypoContent.label,
            type: NodeType.HYPOTHESIS,
            confidence: ConfidenceVectorSchema.parse({
              empirical_support: this.hypothesisConfidenceValues[0],
              theoretical_basis: this.hypothesisConfidenceValues[1],
              methodological_rigor: this.hypothesisConfidenceValues[2],
              consensus_alignment: this.hypothesisConfidenceValues[3],
            }),
            metadata: hypoMetadata,
          });

          const hypPropsForNeo4j = prepareNodePropertiesForNeo4j(hypothesisNode);

          batchHypothesisNodeData.push({
            props: hypPropsForNeo4j,
            type_label_value: NodeType.HYPOTHESIS.valueOf(),
            dim_id_source: dimId,
            hypo_label_original: hypoContent.label,
          });
        }
      } catch (error: any) {
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
        const resultsNodes = await executeQuery(
          batchNodeQuery,
          { batch_data: batchHypothesisNodeData },
          "write"
        );

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
      } catch (error: any) {
        logger.error(`Neo4j error during batch hypothesis node creation: ${error.message}`, error);
      }
    }

    const batchRelationshipData: any[] = [];
    if (Object.keys(createdHypothesesMap).length > 0) {
      for (const createdHypId in createdHypothesesMap) {
        const hypoDataMap = createdHypothesesMap[createdHypId];
        const dimIdForRel = hypoDataMap.dim_id;
        const hypoLabelForRel = hypoDataMap.label;

        const dimLabelPlaceholder = `Dimension for '${hypoLabelForRel.substring(0, 20)}...'`;

        const edgeId = `edge_${dimIdForRel}_genhyp_${createdHypId}_${uuidv4()}`;
        const edgeMetadata: EdgeMetadata = {
          description: `Hypothesis '${hypoLabelForRel}' generated for dimension '${dimLabelPlaceholder}'.`,
          weight: 1.0,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const edge: Edge = {
          id: edgeId,
          source_id: dimIdForRel,
          target_id: createdHypId,
          type: EdgeType.GENERATES_HYPOTHESIS,
          confidence: 0.95,
          metadata: edgeMetadata,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const edgePropsForNeo4j = prepareEdgePropertiesForNeo4j(edge);
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
        const resultRels = await executeQuery(
          batchRelQuery,
          { batch_rels: batchRelationshipData },
          "write"
        );
        if (resultRels && resultRels.length > 0 && resultRels[0].total_rels_created !== undefined) {
          edgesCreatedCount = resultRels[0].total_rels_created;
          logger.debug(`Batch created ${edgesCreatedCount} GENERATES_HYPOTHESIS relationships.`);
        } else {
          logger.error("Batch relationship creation query did not return expected count.");
        }
      } catch (error: any) {
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

    return new StageOutput(
      true,
      summary,
      { [this.stageName]: contextUpdate },
      undefined,
      metrics
    );
  }
}