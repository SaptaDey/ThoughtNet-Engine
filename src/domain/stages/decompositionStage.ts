import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { Node, NodeMetadata, NodeType, Edge, EdgeMetadata, EdgeType, createNode } from '../models/graphElements';
import { ConfidenceVectorSchema, EpistemicStatus } from '../models/common';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';
import { prepareNodePropertiesForNeo4j, prepareEdgePropertiesForNeo4j } from '../utils/neo4jHelpers';
import { InitializationStage } from './initializationStage';

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

export class DecompositionStage extends BaseStage {
  static STAGE_NAME: string = "DecompositionStage";
  stageName: string = DecompositionStage.STAGE_NAME;
  private defaultDimensionsConfig: any[]; // Use a more specific type if available
  private dimensionConfidenceValues: number[];

  constructor(settings: any) {
    super(settings);
    this.defaultDimensionsConfig = settings.asr_got.default_parameters?.default_decomposition_dimensions || [];
    this.dimensionConfidenceValues = settings.asr_got.default_parameters?.dimension_confidence || [0.5, 0.5, 0.5, 0.5];
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private _getConceptualDimensions(
    rootNodeQueryContext: string | undefined,
    customDimensionsInput: any[] | undefined
  ): { label: string; description: string; id?: string }[] {
    if (customDimensionsInput && Array.isArray(customDimensionsInput)) {
      logger.info("Using custom decomposition dimensions provided in operational parameters.");
      return customDimensionsInput.filter(dim => typeof dim === 'object' && dim !== null && 'label' in dim && 'description' in dim);
    } else {
      logger.info("Using default decomposition dimensions from configuration.");
      return this.defaultDimensionsConfig.map((dim: any) => ({ label: dim.label, description: dim.description }));
    }
  }

  async execute(currentSessionData: GoTProcessorSessionData): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);

    const initializationData = currentSessionData.accumulated_context[InitializationStage.STAGE_NAME] || {};
    const rootNodeId = initializationData.root_node_id;
    const initialDisciplinaryTags: Set<string> = new Set(initializationData.initial_disciplinary_tags || []);

    if (!rootNodeId) {
      const errMsg = "Root node ID not found in session context. Cannot proceed.";
      logger.error(errMsg);
      return new StageOutput(
        false,
        errMsg,
        { [this.stageName]: { error: errMsg, dimension_node_ids: [] } },
        errMsg,
        {
          dimensions_created_in_neo4j: 0,
          relationships_created_in_neo4j: 0,
        }
      );
    }

    let rootNodeInfo: Record<string, any> | undefined;
    try {
      const query = "MATCH (n:Node {id: $root_node_id}) RETURN properties(n) AS props";
      const results = await executeQuery(query, { root_node_id: rootNodeId }, "read");
      if (results && results.length > 0 && results[0].props) {
        rootNodeInfo = results[0].props;
      } else {
        const errMsg = `Root node ${rootNodeId} not found in Neo4j.`;
        logger.error(errMsg);
        return new StageOutput(
          false,
          errMsg,
          { [this.stageName]: { error: errMsg, dimension_node_ids: [] } },
          errMsg,
          {
            dimensions_created_in_neo4j: 0,
            relationships_created_in_neo4j: 0,
          }
        );
      }
    } catch (error: any) {
      const errMsg = `Neo4j error fetching root node ${rootNodeId}: ${error.message}`;
      logger.error(errMsg, error);
      return new StageOutput(
        false,
        errMsg,
        { [this.stageName]: { error: errMsg, dimension_node_ids: [] } },
        errMsg,
        {
          dimensions_created_in_neo4j: 0,
          relationships_created_in_neo4j: 0,
        }
      );
    }

    const decompositionInputText = rootNodeInfo?.metadata_query_context || rootNodeInfo?.label || "Root Task";
    const rootNodeLayerStr = rootNodeInfo?.metadata_layer_id || this.settings.asr_got.default_parameters?.initial_layer || "0";

    const operationalParams = currentSessionData.accumulated_context.operational_params || {};
    const customDimensionsInput = operationalParams.decomposition_dimensions;

    const dimensionsToCreateConceptual = this._getConceptualDimensions(
      decompositionInputText,
      customDimensionsInput
    );

    const dimensionNodeIdsCreated: string[] = [];
    let nodesCreatedCount = 0;
    let edgesCreatedCount = 0;
    const dimensionLabelsCreated: string[] = [];

    const batchDimensionNodeData: any[] = [];
    const createdDimensionsMap: { [originalId: string]: string } = {};

    for (let i = 0; i < dimensionsToCreateConceptual.length; i++) {
      const dimData = dimensionsToCreateConceptual[i];
      const dimLabel = dimData.label || `Dimension ${i + 1}`;
      const dimDescription = dimData.description || `Details for ${dimLabel}`;
      const originalDimIdentifier = dimData.id || dimLabel;
      const dimIdNeo4j = `dim_${rootNodeId}_${i}_${uuidv4()}`; // Ensure unique ID

      const dimMetadata: NodeMetadata = {
        description: dimDescription,
        query_context: currentSessionData.query || '',
        source_description: "DecompositionStage (P1.2)",
        epistemic_status: EpistemicStatus.ASSUMPTION,
        disciplinary_tags: Array.from(initialDisciplinaryTags).join(','),
        layer_id: operationalParams.dimension_layer || rootNodeLayerStr,
        impact_score: 0.7,
        is_knowledge_gap: false,
        id: uuidv4(),
        doi: '',
        authors: '',
        publication_date: '',
        revision_history: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const dimensionNode: Node = createNode({
        id: dimIdNeo4j,
        label: dimLabel,
        type: NodeType.DECOMPOSITION_DIMENSION,
        confidence: ConfidenceVectorSchema.parse({
          empirical_support: this.dimensionConfidenceValues[0],
          theoretical_basis: this.dimensionConfidenceValues[1],
          methodological_rigor: this.dimensionConfidenceValues[2],
          consensus_alignment: this.dimensionConfidenceValues[3],
        }),
        metadata: dimMetadata,
      });

      const nodePropsForNeo4j = prepareNodePropertiesForNeo4j(dimensionNode);
      const typeLabelValue = NodeType.DECOMPOSITION_DIMENSION.valueOf();

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
        const resultsNodes = await executeQuery(
          batchNodeQuery,
          { batch_data: batchDimensionNodeData },
          "write"
        );

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
      } catch (error: any) {
        logger.error(`Neo4j error during batch dimension node creation: ${error.message}`, error);
      }
    }

    const batchRelationshipData: any[] = [];
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

        const edgeId = `edge_${createdDimensionId}_decompof_${rootNodeId}_${uuidv4()}`;
        const edgeMetadata: EdgeMetadata = {
          description: `'${dimLabelForEdge}' is a decomposition of '${decompositionInputText.substring(0, 30)}...'`,
          weight: 1.0,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const edge: Edge = {
          id: edgeId,
          source_id: createdDimensionId,
          target_id: rootNodeId,
          type: EdgeType.DECOMPOSITION_OF,
          confidence: 0.95,
          metadata: edgeMetadata,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const edgePropsForNeo4j = prepareEdgePropertiesForNeo4j(edge);
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
        const resultRels = await executeQuery(
          batchRelQuery,
          { batch_rels: batchRelationshipData },
          "write"
        );
        if (resultRels && resultRels.length > 0 && resultRels[0].total_rels_created !== undefined) {
          edgesCreatedCount = resultRels[0].total_rels_created;
          logger.debug(`Batch created ${edgesCreatedCount} DECOMPOSITION_OF relationships.`);
        } else {
          logger.error("Batch relationship creation query did not return expected count.");
        }
      } catch (error: any) {
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

    const output = new StageOutput(
      true,
      summary,
      { [this.stageName]: contextUpdate },
      undefined,
      metrics
    );
    this._logEnd(currentSessionData.session_id, output);
    return output;
  }
}