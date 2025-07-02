
import winston from 'winston';
import { GoTProcessor } from '../../application/gotProcessor';
import { GraphRepository } from '../interfaces/graphRepository';
import { Node, NodeType, Edge, EdgeType } from '../models/graphElements';
import { ConfidenceVectorSchema } from '../models/common';
import { buildGraph, detectCommunities, calculateNodeCentrality, findShortestPath } from '../utils/graphAnalysisHelpers';
import { bayesianUpdateConfidence, performStatisticalTest } from '../utils/mathHelpers';
import { v4 as uuidv4 } from 'uuid';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export interface ReasoningResult {
  answer: string;
  confidence: number;
  evidenceNodes: string[];
  reasoningPath: string[];
  graphMetrics: {
    totalNodes: number;
    totalEdges: number;
    communities: number;
    avgCentrality: number;
  };
  processingTime: number;
}

export interface QueryContext {
  query: string;
  confidenceThreshold: number;
  maxDepth: number;
  includeEvidence: boolean;
  analysisType: 'comprehensive' | 'fast' | 'deep';
}

export class AdaptiveGraphServer {
  private gotProcessor: GoTProcessor;
  private graphRepo: GraphRepository;

  constructor(gotProcessor: GoTProcessor, graphRepo: GraphRepository) {
    this.gotProcessor = gotProcessor;
    this.graphRepo = graphRepo;
  }

  private async _processReasoningSync(query: string, confidenceThreshold: number): Promise<ReasoningResult> {
    const startTime = Date.now();
    logger.info(`Starting Graph of Thoughts reasoning for query: "${query}"`);

    try {
      // Step 1: Initialize the reasoning context
      const context: QueryContext = {
        query,
        confidenceThreshold,
        maxDepth: 5,
        includeEvidence: true,
        analysisType: 'comprehensive'
      };

      // Step 2: Build the knowledge graph from current data
      const knowledgeGraph = await this.buildKnowledgeGraph(query);
      
      // Step 3: Perform graph analysis to identify key concepts and relationships
      const graphAnalysis = await this.analyzeKnowledgeGraph(knowledgeGraph);
      
      // Step 4: Generate hypotheses based on graph structure and query
      const hypotheses = await this.generateHypotheses(query, knowledgeGraph, graphAnalysis);
      
      // Step 5: Evaluate hypotheses using evidence from the graph
      const evaluatedHypotheses = await this.evaluateHypotheses(hypotheses, knowledgeGraph, context);
      
      // Step 6: Synthesize final answer based on best hypothesis
      const reasoning = await this.synthesizeReasoning(evaluatedHypotheses, context);
      
      // Step 7: Calculate final confidence and validate result
      const finalResult = await this.validateAndScoreResult(reasoning, context);

      const processingTime = Date.now() - startTime;
      logger.info(`Graph of Thoughts reasoning completed in ${processingTime}ms`);

      return {
        ...finalResult,
        processingTime
      };

    } catch (error) {
      logger.error(`Error in Graph of Thoughts reasoning: ${error}`);
      throw new Error(`Reasoning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async buildKnowledgeGraph(query: string): Promise<any> {
    logger.debug('Building knowledge graph from query');
    
    // Query related nodes from Neo4j
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const searchTerms = queryWords.map(word => `(?i).*${word}.*`).join('|');
    
    const nodeQuery = `
      MATCH (n:Node)
      WHERE n.label =~ $searchTerms OR n.description =~ $searchTerms
      RETURN n
      LIMIT 50
    `;
    
    const edgeQuery = `
      MATCH (source:Node)-[r]->(target:Node)
      WHERE source.label =~ $searchTerms OR target.label =~ $searchTerms
      RETURN source, r, target
      LIMIT 100
    `;

    const [nodeResults, edgeResults] = await Promise.all([
      this.graphRepo.executeQuery(nodeQuery, { searchTerms }),
      this.graphRepo.executeQuery(edgeQuery, { searchTerms })
    ]);

    // Convert to internal graph representation
    const nodes = nodeResults.map((result: any) => ({
      id: result.n.properties.id,
      label: result.n.properties.label,
      type: result.n.properties.type,
      confidence: result.n.properties.conf_empirical || 0.5,
      metadata: result.n.properties
    }));

    const edges = edgeResults.map((result: any) => ({
      source: result.source.properties.id,
      target: result.target.properties.id,
      type: result.r.type,
      weight: result.r.properties.weight || 1.0,
      confidence: result.r.properties.confidence || 0.5
    }));

    return buildGraph(nodes, edges);
  }

  private async analyzeKnowledgeGraph(graph: any): Promise<any> {
    logger.debug('Analyzing knowledge graph structure');
    
    // Detect communities to understand concept clusters
    const communities = detectCommunities(graph);
    
    // Calculate node centrality to identify key concepts
    const centrality = calculateNodeCentrality(graph);
    
    // Find important nodes (high centrality)
    const importantNodes = Object.entries(centrality.degree)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([nodeId]) => nodeId);

    return {
      communities,
      centrality,
      importantNodes,
      graphSize: {
        nodes: graph.nodes.size,
        edges: graph.edges.length
      }
    };
  }

  private async generateHypotheses(query: string, graph: any, analysis: any): Promise<Array<any>> {
    logger.debug('Generating hypotheses from graph analysis');
    
    const hypotheses: Array<any> = [];
    
    // Generate hypotheses based on important nodes and their relationships
    for (const nodeId of analysis.importantNodes.slice(0, 3)) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      // Find paths from this important node to other important nodes
      for (const targetId of analysis.importantNodes.slice(0, 3)) {
        if (nodeId === targetId) continue;
        
        const path = findShortestPath(graph, nodeId, targetId);
        if (path && path.length > 1) {
          hypotheses.push({
            id: uuidv4(),
            type: 'path_based',
            description: `Connection between ${node.label || nodeId} and related concepts`,
            confidence: 0.6,
            evidencePath: path,
            sourceNode: nodeId,
            targetNode: targetId,
            reasoning: `Graph analysis indicates a relationship path of length ${path.length - 1}`
          });
        }
      }
    }

    // Generate community-based hypotheses
    const communityGroups = Object.entries(analysis.communities.communities)
      .reduce((groups: Record<number, string[]>, [nodeId, communityId]) => {
        if (!groups[communityId as number]) groups[communityId as number] = [];
        groups[communityId as number].push(nodeId);
        return groups;
      }, {});

    Object.entries(communityGroups).forEach(([communityId, nodeIds]) => {
      if (nodeIds.length >= 2) {
        hypotheses.push({
          id: uuidv4(),
          type: 'community_based',
          description: `Concept cluster ${communityId} contains related information`,
          confidence: 0.7,
          evidenceNodes: nodeIds,
          reasoning: `Community detection found ${nodeIds.length} related concepts`
        });
      }
    });

    logger.info(`Generated ${hypotheses.length} hypotheses for evaluation`);
    return hypotheses;
  }

  private async evaluateHypotheses(hypotheses: Array<any>, graph: any, context: QueryContext): Promise<Array<any>> {
    logger.debug('Evaluating hypotheses using evidence');
    
    const evaluatedHypotheses = [];
    
    for (const hypothesis of hypotheses) {
      let evidenceScore = 0;
      let evidenceCount = 0;
      const supportingEvidence: Array<any> = [];

      if (hypothesis.type === 'path_based' && hypothesis.evidencePath) {
        // Evaluate path-based hypothesis
        for (let i = 0; i < hypothesis.evidencePath.length - 1; i++) {
          const sourceId = hypothesis.evidencePath[i];
          const targetId = hypothesis.evidencePath[i + 1];
          
          // Find edge between these nodes
          const edge = graph.edges.find((e: any) => 
            (e.source === sourceId && e.target === targetId) ||
            (e.source === targetId && e.target === sourceId)
          );
          
          if (edge) {
            evidenceScore += edge.confidence || 0.5;
            evidenceCount++;
            supportingEvidence.push({
              type: 'edge',
              confidence: edge.confidence,
              description: `Connection between ${sourceId} and ${targetId}`
            });
          }
        }
      } else if (hypothesis.type === 'community_based' && hypothesis.evidenceNodes) {
        // Evaluate community-based hypothesis
        for (const nodeId of hypothesis.evidenceNodes) {
          const node = graph.nodes.get(nodeId);
          if (node && node.confidence) {
            evidenceScore += node.confidence;
            evidenceCount++;
            supportingEvidence.push({
              type: 'node',
              confidence: node.confidence,
              description: `Node ${nodeId} supports the hypothesis`
            });
          }
        }
      }

      // Calculate final confidence using Bayesian update
      const avgEvidenceStrength = evidenceCount > 0 ? evidenceScore / evidenceCount : 0;
      const priorConfidence = {
        empirical_support: hypothesis.confidence,
        theoretical_basis: 0.5,
        methodological_rigor: 0.6,
        consensus_alignment: 0.5
      };

      const bayesianResult = bayesianUpdateConfidence(
        priorConfidence,
        avgEvidenceStrength,
        true, // assume evidence supports hypothesis
        'empirical',
        evidenceCount
      );

      evaluatedHypotheses.push({
        ...hypothesis,
        finalConfidence: bayesianResult.updatedConfidence.empirical_support,
        evidenceScore: avgEvidenceStrength,
        evidenceCount,
        supportingEvidence,
        bayesianUpdate: bayesianResult
      });
    }

    // Sort by confidence
    evaluatedHypotheses.sort((a, b) => b.finalConfidence - a.finalConfidence);
    
    logger.info(`Evaluated ${evaluatedHypotheses.length} hypotheses`);
    return evaluatedHypotheses;
  }

  private async synthesizeReasoning(hypotheses: Array<any>, context: QueryContext): Promise<any> {
    logger.debug('Synthesizing reasoning from evaluated hypotheses');
    
    // Take the best hypotheses that meet the confidence threshold
    const validHypotheses = hypotheses.filter(h => h.finalConfidence >= context.confidenceThreshold);
    
    if (validHypotheses.length === 0) {
      return {
        answer: "Based on the available information, I cannot provide a confident answer to this query.",
        confidence: 0.0,
        evidenceNodes: [],
        reasoningPath: [],
        reasoning: "No hypotheses met the confidence threshold"
      };
    }

    const bestHypothesis = validHypotheses[0];
    let answer = "";
    let reasoningPath: string[] = [];
    let evidenceNodes: string[] = [];

    if (bestHypothesis.type === 'path_based') {
      answer = `Based on graph analysis, there is a connection path through: ${bestHypothesis.evidencePath.join(' → ')}. `;
      answer += bestHypothesis.reasoning;
      reasoningPath = bestHypothesis.evidencePath;
      evidenceNodes = bestHypothesis.evidencePath;
    } else if (bestHypothesis.type === 'community_based') {
      answer = `Graph analysis reveals a cluster of related concepts that address your query. `;
      answer += `This cluster contains ${bestHypothesis.evidenceNodes.length} related elements. `;
      answer += bestHypothesis.reasoning;
      evidenceNodes = bestHypothesis.evidenceNodes;
      reasoningPath = bestHypothesis.evidenceNodes.slice(0, 5); // Limit for readability
    }

    // Add confidence and evidence information
    if (bestHypothesis.evidenceCount > 0) {
      answer += ` This conclusion is supported by ${bestHypothesis.evidenceCount} pieces of evidence `;
      answer += `with an average strength of ${(bestHypothesis.evidenceScore * 100).toFixed(1)}%.`;
    }

    return {
      answer,
      confidence: bestHypothesis.finalConfidence,
      evidenceNodes: evidenceNodes.slice(0, 10), // Limit for response size
      reasoningPath: reasoningPath.slice(0, 10),
      bestHypothesis,
      allValidHypotheses: validHypotheses.slice(0, 3) // Top 3 for context
    };
  }

  private async validateAndScoreResult(reasoning: any, context: QueryContext): Promise<ReasoningResult> {
    logger.debug('Validating and scoring final result');
    
    // Calculate graph metrics
    const graphMetrics = {
      totalNodes: 0,
      totalEdges: 0,
      communities: 0,
      avgCentrality: 0
    };

    // Basic validation - ensure we have some evidence
    if (reasoning.evidenceNodes.length === 0) {
      logger.warn('No evidence nodes found for reasoning result');
    }

    // Ensure confidence is within valid range
    const confidence = Math.max(0, Math.min(1, reasoning.confidence));

    return {
      answer: reasoning.answer,
      confidence,
      evidenceNodes: reasoning.evidenceNodes,
      reasoningPath: reasoning.reasoningPath,
      graphMetrics,
      processingTime: 0 // Will be set by calling function
    };
  }

  async processReasoningAsync(query: string, confidenceThreshold: number = 0.7): Promise<ReasoningResult> {
    const timeoutPromise = new Promise<ReasoningResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Processing timed out after 30 seconds`)), 30000)
    );

    try {
      const result = await Promise.race([
        this._processReasoningSync(query, confidenceThreshold),
        timeoutPromise,
      ]);
      return result;
    } catch (error: any) {
      logger.warn(`processReasoningAsync timed out or failed: ${error.message}`);
      
      // Return a fallback result instead of throwing
      return {
        answer: "I apologize, but I encountered an issue processing your query. The reasoning process either timed out or encountered an error.",
        confidence: 0.0,
        evidenceNodes: [],
        reasoningPath: [],
        graphMetrics: {
          totalNodes: 0,
          totalEdges: 0,
          communities: 0,
          avgCentrality: 0
        },
        processingTime: 30000
      };
    }
  }

  async getGraphStatistics(): Promise<any> {
    try {
      const nodeCountQuery = "MATCH (n:Node) RETURN count(n) as nodeCount";
      const edgeCountQuery = "MATCH ()-[r]->() RETURN count(r) as edgeCount";
      
      const [nodeResult, edgeResult] = await Promise.all([
        this.graphRepo.executeQuery(nodeCountQuery),
        this.graphRepo.executeQuery(edgeCountQuery)
      ]);

      return {
        totalNodes: nodeResult[0]?.nodeCount || 0,
        totalEdges: edgeResult[0]?.edgeCount || 0,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting graph statistics:', error);
      return { totalNodes: 0, totalEdges: 0, lastUpdated: null };
    }
  }
}
