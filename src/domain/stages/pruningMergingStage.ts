import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
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

export class PruningMergingStage extends BaseStage {
  static STAGE_NAME: string = "PruningMergingStage";
  stageName: string = PruningMergingStage.STAGE_NAME;
  private pruningConfidenceThreshold: number;
  private pruningImpactThreshold: number;
  private mergingSemanticOverlapThreshold: number;
  private pruningEdgeConfidenceThreshold: number;

  constructor(settings: any) {
    super(settings);
    this.pruningConfidenceThreshold = settings.asr_got.default_parameters?.pruning_confidence_threshold || 0.5;
    this.pruningImpactThreshold = settings.asr_got.default_parameters?.pruning_impact_threshold || 0.1;
    this.mergingSemanticOverlapThreshold = settings.asr_got.default_parameters?.merging_semantic_overlap_threshold || 0.8;
    this.pruningEdgeConfidenceThreshold = settings.asr_got.default_parameters?.pruning_edge_confidence_threshold || 0.2;
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private async _pruneLowConfidenceAndIsolatedNodesInNeo4j(): Promise<number> {
    const combinedQuery = `
      OPTIONAL MATCH (n:Node)
      WHERE NOT n:ROOT
        AND NOT n:DECOMPOSITION_DIMENSION
        AND n.type IN ['HYPOTHESIS', 'EVIDENCE', 'INTERDISCIPLINARY_BRIDGE']
        AND coalesce(
              apoc.coll.min([
                  coalesce(n.confidence_empirical_support, 1.0),
                  coalesce(n.confidence_theoretical_basis, 1.0),
                  coalesce(n.confidence_methodological_rigor, 1.0),
                  coalesce(n.confidence_consensus_alignment, 1.0)
              ]), 1.0
          ) < $conf_thresh
        AND coalesce(n.metadata_impact_score, 1.0) < $impact_thresh
      WITH collect(DISTINCT n) AS low_conf_nodes
      OPTIONAL MATCH (m:Node)
      WHERE NOT m:ROOT AND size((m)--()) = 0
      WITH low_conf_nodes + collect(DISTINCT m) AS nodes_to_delete
      FOREACH (nd IN nodes_to_delete | DETACH DELETE nd)
      RETURN size(nodes_to_delete) AS pruned_count
    `;
    try {
      const result = await executeQuery(
        combinedQuery,
        {
          conf_thresh: this.pruningConfidenceThreshold,
          impact_thresh: this.pruningImpactThreshold,
        },
        "write"
      );
      const prunedCount = result && result.length > 0 ? result[0].pruned_count : 0;
      if (prunedCount > 0) {
        logger.info(`Pruned ${prunedCount} nodes (low-confidence/impact or isolated) from Neo4j.`);
      } else {
        logger.info("No nodes met the criteria for combined pruning.");
      }
      return prunedCount;
    } catch (error: any) {
      logger.error(`Neo4j error during node pruning: ${error.message}`, error);
      return 0;
    }
  }

  private async _pruneLowConfidenceEdgesInNeo4j(): Promise<number> {
    const query = `
      MATCH ()-[r]->()
      WHERE r.confidence IS NOT NULL AND r.confidence < $threshold
      DELETE r
      RETURN count(r) as pruned_count
    `;
    try {
      const result = await executeQuery(
        query,
        { threshold: this.pruningEdgeConfidenceThreshold },
        "write"
      );
      const prunedCount = result && result.length > 0 ? result[0].pruned_count : 0;
      if (prunedCount > 0) {
        logger.info(`Pruned ${prunedCount} low-confidence edges from Neo4j.`);
      }
      return prunedCount;
    } catch (error: any) {
      logger.error(`Neo4j error during low-confidence edge pruning: ${error.message}`, error);
      return 0;
    }
  }

  private async _mergeNodesInNeo4j(): Promise<number> {
    logger.info("Starting node merging based on semantic similarity and content overlap...");
    
    try {
      // Step 1: Find candidate pairs of nodes that might be mergeable
      const candidateQuery = `
        MATCH (n1:Node), (n2:Node)
        WHERE n1.id < n2.id 
          AND n1.type = n2.type
          AND n1.type IN ['HYPOTHESIS', 'EVIDENCE']
          AND NOT n1:ROOT AND NOT n2:ROOT
          AND NOT n1:DECOMPOSITION_DIMENSION AND NOT n2:DECOMPOSITION_DIMENSION
        RETURN n1.id AS id1, n1.label AS label1, n1.metadata_disciplinary_tags AS tags1,
               n2.id AS id2, n2.label AS label2, n2.metadata_disciplinary_tags AS tags2
        LIMIT 100
      `;
      
      const candidates = await executeQuery(candidateQuery, {}, "read");
      if (!candidates || candidates.length === 0) {
        logger.info("No candidate node pairs found for merging.");
        return 0;
      }
      
      let mergedPairs = 0;
      
      for (const candidate of candidates) {
        const similarity = this._calculateNodeSimilarity(
          candidate.label1, candidate.tags1,
          candidate.label2, candidate.tags2
        );
        
        if (similarity >= this.mergingSemanticOverlapThreshold) {
          const success = await this._mergeNodePair(candidate.id1, candidate.id2);
          if (success) {
            mergedPairs++;
            logger.info(`Merged nodes ${candidate.id1} and ${candidate.id2} (similarity: ${similarity.toFixed(3)})`);
          }
        }
      }
      
      logger.info(`Successfully merged ${mergedPairs} node pairs.`);
      return mergedPairs;
      
    } catch (error: any) {
      logger.error(`Error during node merging: ${error.message}`, error);
      return 0;
    }
  }
  
  private _calculateNodeSimilarity(label1: string, tags1: string[], label2: string, tags2: string[]): number {
    // Calculate semantic similarity based on label and tags
    const words1 = (label1 || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = (label2 || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const tags1Set = new Set((tags1 || []).map(t => t.toLowerCase()));
    const tags2Set = new Set((tags2 || []).map(t => t.toLowerCase()));
    
    // Word overlap score
    const commonWords = words1.filter(w => words2.includes(w)).length;
    const totalWords = new Set([...words1, ...words2]).size;
    const wordSimilarity = totalWords > 0 ? commonWords / totalWords : 0;
    
    // Tag overlap score
    const commonTags = Array.from(tags1Set).filter(t => tags2Set.has(t)).length;
    const totalTags = new Set([...tags1Set, ...tags2Set]).size;
    const tagSimilarity = totalTags > 0 ? commonTags / totalTags : 0;
    
    // Combined similarity score (weighted)
    return wordSimilarity * 0.7 + tagSimilarity * 0.3;
  }
  
  private async _mergeNodePair(node1Id: string, node2Id: string): Promise<boolean> {
    try {
      // Merge node2 into node1, combining their properties and relationships
      const mergeQuery = `
        MATCH (n1:Node {id: $node1Id}), (n2:Node {id: $node2Id})
        
        // Merge confidence vectors (take average)
        SET n1.confidence_empirical_support = (coalesce(n1.confidence_empirical_support, 0.5) + coalesce(n2.confidence_empirical_support, 0.5)) / 2
        SET n1.confidence_theoretical_basis = (coalesce(n1.confidence_theoretical_basis, 0.5) + coalesce(n2.confidence_theoretical_basis, 0.5)) / 2
        SET n1.confidence_methodological_rigor = (coalesce(n1.confidence_methodological_rigor, 0.5) + coalesce(n2.confidence_methodological_rigor, 0.5)) / 2
        SET n1.confidence_consensus_alignment = (coalesce(n1.confidence_consensus_alignment, 0.5) + coalesce(n2.confidence_consensus_alignment, 0.5)) / 2
        
        // Update metadata
        SET n1.updated_at = datetime()
        SET n1.label = CASE 
          WHEN length(n1.label) >= length(n2.label) THEN n1.label 
          ELSE n2.label 
        END
        
        // Merge relationships from n2 to n1
        WITH n1, n2
        OPTIONAL MATCH (n2)-[r]->(target)
        WHERE target <> n1
        MERGE (n1)-[newR:RELATIONSHIP_TYPE]->(target)
        ON CREATE SET newR = properties(r)
        
        WITH n1, n2
        OPTIONAL MATCH (source)-[r]->(n2)
        WHERE source <> n1
        MERGE (source)-[newR:RELATIONSHIP_TYPE]->(n1)
        ON CREATE SET newR = properties(r)
        
        // Delete the merged node
        WITH n1, n2
        DETACH DELETE n2
        
        RETURN n1.id AS surviving_node
      `;
      
      const result = await executeQuery(mergeQuery, { node1Id, node2Id }, "write");
      return result && result.length > 0;
      
    } catch (error: any) {
      logger.error(`Failed to merge nodes ${node1Id} and ${node2Id}: ${error.message}`);
      return false;
    }
  }

  async execute(currentSessionData: GoTProcessorSessionData): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);

    let totalNodesPruned = 0;
    let totalEdgesPruned = 0;

    logger.info("Starting Neo4j node pruning phase (low confidence/impact and isolated)...");
    const nodesPrunedConfImpact = await this._pruneLowConfidenceAndIsolatedNodesInNeo4j();
    totalNodesPruned += nodesPrunedConfImpact;

    logger.info("Starting Neo4j edge pruning phase (low confidence)...");
    const edgesPrunedConf = await this._pruneLowConfidenceEdgesInNeo4j();
    totalEdgesPruned += edgesPrunedConf;

    logger.info("Starting Neo4j node merging phase (currently placeholder)...");
    const mergedCount = await this._mergeNodesInNeo4j();

    let nodesRemaining = 0;
    let edgesRemaining = 0;
    try {
      const nodeCountRes = await executeQuery(
        "MATCH (n:Node) RETURN count(n) AS node_count",
        {},
        "read"
      );
      if (nodeCountRes && nodeCountRes.length > 0) {
        nodesRemaining = nodeCountRes[0].node_count;
      }

      const edgeCountRes = await executeQuery(
        "MATCH ()-[r]->() RETURN count(r) AS edge_count",
        {},
        "read"
      );
      if (edgeCountRes && edgeCountRes.length > 0) {
        edgesRemaining = edgeCountRes[0].edge_count;
      }
    } catch (error: any) {
      logger.error(`Failed to get node/edge counts from Neo4j: ${error.message}`, error);
    }

    const summary = `Neo4j graph refinement completed. Total nodes pruned: ${totalNodesPruned}. Total edges pruned: ${totalEdgesPruned}. Nodes merged (pairs): ${mergedCount} (merging logic is simplified/placeholder).`;
    const metrics = {
      nodes_pruned_in_neo4j: totalNodesPruned,
      edges_pruned_in_neo4j: totalEdgesPruned,
      nodes_merged_in_neo4j: mergedCount,
      nodes_remaining_in_neo4j: nodesRemaining,
      edges_remaining_in_neo4j: edgesRemaining,
    };
    const contextUpdate = {
      pruning_merging_completed: true,
      nodes_after_pruning_merging_in_neo4j: nodesRemaining,
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