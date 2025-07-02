
import { z } from 'zod';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { NodeType } from '../models/graphElements';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';

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

export const SubgraphCriterionSchema = z.object({
  name: z.string(),
  description: z.string(),
  min_avg_confidence: z.number().min(0.0).max(1.0).optional(),
  min_impact_score: z.number().min(0.0).max(1.0).optional(),
  node_types: z.array(z.nativeEnum(NodeType)).optional(),
  include_disciplinary_tags: z.array(z.string()).optional(),
  exclude_disciplinary_tags: z.array(z.string()).optional(),
  layer_ids: z.array(z.string()).optional(),
  is_knowledge_gap: z.boolean().optional(),
  include_neighbors_depth: z.number().int().min(0).default(0),
});

export type SubgraphCriterion = z.infer<typeof SubgraphCriterionSchema>;

export const ExtractedSubgraphDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  nodes: z.array(z.record(z.any())),
  relationships: z.array(z.record(z.any())),
  metrics: z.record(z.any()),
});

export type ExtractedSubgraphData = z.infer<typeof ExtractedSubgraphDataSchema>;

export class SubgraphExtractionStage extends BaseStage {
  stageName: string = "SubgraphExtractionStage";
  private defaultExtractionCriteria: SubgraphCriterion[];

  constructor(settings: any) {
    super(settings);
    this.defaultExtractionCriteria = [ 
      SubgraphCriterionSchema.parse({
        name: "high_confidence_core",
        description: "Nodes with high average confidence and impact.",
        min_avg_confidence: settings.asr_got.default_parameters?.subgraph_min_confidence_threshold || 0.6,
        min_impact_score: settings.asr_got.default_parameters?.subgraph_min_impact_threshold || 0.6,
        node_types: [
          NodeType.HYPOTHESIS,
          NodeType.EVIDENCE,
          NodeType.INTERDISCIPLINARY_BRIDGE,
        ],
        include_neighbors_depth: 1,
      }),
      SubgraphCriterionSchema.parse({
        name: "key_hypotheses_and_support",
        description: "Key hypotheses and their direct support.",
        node_types: [NodeType.HYPOTHESIS],
        min_avg_confidence: 0.5,
        min_impact_score: 0.5,
        include_neighbors_depth: 1,
      }),
      SubgraphCriterionSchema.parse({
        name: "knowledge_gaps_focus",
        description: "Identified knowledge gaps.",
        is_knowledge_gap: true,
        node_types: [NodeType.PLACEHOLDER_GAP, NodeType.RESEARCH_QUESTION],
        include_neighbors_depth: 1,
      }),
    ];
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private _buildCypherConditionsForCriterion(
    criterion: SubgraphCriterion,
    params: Record<string, any>
  ): string[] {
    const conditions: string[] = [];

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
      const tagConditions: string[] = [];
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
      const tagConditions: string[] = [];
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

  private _formatNeo4jNode(neo4jNodeMap: Record<string, any>): Record<string, any> {
    if (
      "properties" in neo4jNodeMap &&
      "id" in neo4jNodeMap &&
      "labels" in neo4jNodeMap
    ) {
      return {
        id: neo4jNodeMap.id,
        labels: neo4jNodeMap.labels,
        properties: neo4jNodeMap.properties,
      };
    }
    const propsCopy = { ...neo4jNodeMap };
    const nodeId = propsCopy.id;
    delete propsCopy.id;
    const labels = propsCopy.labels || ["Node"]; // Default if no labels field
    delete propsCopy.labels;
    return { id: nodeId, labels: labels, properties: propsCopy };
  }

  private _formatNeo4jRelationship(neo4jRelMap: Record<string, any>): Record<string, any> {
    if (
      "properties" in neo4jRelMap &&
      "id" in neo4jRelMap && // Assuming 'id' is the property name for relationship ID
      "type" in neo4jRelMap &&
      "start" in neo4jRelMap && // Neo4j driver returns start/end node elementIds
      "end" in neo4jRelMap
    ) {
      return {
        id: neo4jRelMap.id,
        type: neo4jRelMap.type,
        source_id: neo4jRelMap.start, // Map to our source_id
        target_id: neo4jRelMap.end,   // Map to our target_id
        properties: neo4jRelMap.properties,
      };
    }
    const propsCopy = { ...neo4jRelMap };
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

  private async _extractSingleSubgraphFromNeo4j(
    criterion: SubgraphCriterion
  ): Promise<ExtractedSubgraphData> {
    const seedNodeIds: Set<string> = new Set();
    const params: Record<string, any> = {};
    const conditions = this._buildCypherConditionsForCriterion(criterion, params);

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const seedQuery = `MATCH (n:Node) ${whereClause} RETURN n.id AS id`;

    const extractedNodesDict: Record<string, Record<string, any>> = {};
    const extractedRelsDict: Record<string, Record<string, any>> = {};

    try {
      const seedResults = await executeQuery(seedQuery, params, "read");
      if (seedResults) {
        seedResults.forEach((record: any) => {
          if (record.id) {
            seedNodeIds.add(record.id);
          }
        });
      }

      if (seedNodeIds.size === 0) {
        logger.info(`No seed nodes found for criterion '${criterion.name}'.`);
        return ExtractedSubgraphDataSchema.parse({
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

      logger.debug(
        `Found ${seedNodeIds.size} seed nodes for '${criterion.name}'. Expanding with depth ${criterion.include_neighbors_depth}.`
      );

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

      const subgraphResults = await executeQuery(
        batchApocQuery,
        {
          seed_ids: Array.from(seedNodeIds),
          max_level: criterion.include_neighbors_depth,
        },
        "read"
      );

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
    } catch (error: any) {
      logger.error(
        `Neo4j error extracting subgraph for criterion '${criterion.name}': ${error.message}`,
        error
      );
    }

    const finalNodesList = Object.values(extractedNodesDict);
    const finalRelsList = Object.values(extractedRelsDict);

    logger.info(
      `Extracted subgraph '${criterion.name}' with ${finalNodesList.length} nodes and ${finalRelsList.length} relationships from Neo4j.`
    );
    return ExtractedSubgraphDataSchema.parse({
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
  }

  async execute(
    currentSessionData: GoTProcessorSessionData
  ): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);
    const operationalParams = currentSessionData.accumulated_context.operational_params || {};
    const customCriteriaInput = operationalParams.subgraph_extraction_criteria;
    let criteriaToUse: SubgraphCriterion[] = [];

    if (Array.isArray(customCriteriaInput) && customCriteriaInput.every(c => typeof c === 'object' && c !== null)) {
      try {
        criteriaToUse = customCriteriaInput.map(c => SubgraphCriterionSchema.parse(c));
        logger.info(`Using ${criteriaToUse.length} custom subgraph extraction criteria.`);
      } catch (error: any) {
        logger.warn(`Failed to parse custom subgraph criteria: ${error.message}. Using default criteria.`);
        criteriaToUse = this.defaultExtractionCriteria;
      }
    } else {
      criteriaToUse = this.defaultExtractionCriteria;
      logger.info(`Using ${criteriaToUse.length} default subgraph extraction criteria.`);
    }

    const allExtractedSubgraphsData: ExtractedSubgraphData[] = [];
    for (const criterion of criteriaToUse) {
      try {
        const subgraphData = await this._extractSingleSubgraphFromNeo4j(criterion);
        if (subgraphData.nodes.length > 0) { // Only add if non-empty
          allExtractedSubgraphsData.push(subgraphData);
        }
      } catch (error: any) {
        logger.error(`Error processing criterion '${criterion.name}': ${error.message}`, error);
        continue;
      }
    }

    const summary = `Subgraph extraction complete. Extracted ${allExtractedSubgraphsData.length} subgraphs based on ${criteriaToUse.length} criteria.`;
    const totalNodesExtracted = allExtractedSubgraphsData.reduce(
      (sum, sg) => sum + (sg.metrics.node_count || 0),
      0
    );
    const totalRelsExtracted = allExtractedSubgraphsData.reduce(
      (sum, sg) => sum + (sg.metrics.relationship_count || 0),
      0
    );

    const metrics: Record<string, any> = {
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
