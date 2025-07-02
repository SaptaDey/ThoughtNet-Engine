import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { Node, NodeMetadata, NodeType, Edge, EdgeMetadata, EdgeType, StatisticalPowerSchema, createNode } from '../models/graphElements';
import { ConfidenceVectorSchema, EpistemicStatus } from '../models/common';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';
import { prepareNodePropertiesForNeo4j, prepareEdgePropertiesForNeo4j } from '../utils/neo4jHelpers';
import { HypothesisStage } from './hypothesisStage';
import { buildSafeRelationshipQuery, validateRelationshipType } from '../../utils/cypherValidation';
import { PubMedClient, PubMedArticle, PubMedClientError } from '../../infrastructure/apiClients/pubmedClient';
import { GoogleScholarClient, GoogleScholarArticle, GoogleScholarClientError, UnexpectedResponseStructureError } from '../../infrastructure/apiClients/googleScholarClient';
import { ExaSearchClient, ExaArticleResult, ExaSearchClientError } from '../../infrastructure/apiClients/exaSearchClient';
import { bayesianUpdateConfidence } from '../utils/mathHelpers';
import { calculateSemanticSimilarity } from '../utils/metadataHelpers';
import { Neo4jGraphRepository } from '../../infrastructure/neo4jGraphRepository';

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

export class EvidenceStage extends BaseStage {
  static STAGE_NAME: string = "EvidenceStage";
  stageName: string = EvidenceStage.STAGE_NAME;
  private graphRepo: Neo4jGraphRepository;
  private maxIterations: number;
  private ibnSimilarityThreshold: number;
  private minNodesForHyperedgeConsideration: number;
  private executionLogs: string[] = [];
  private apiCallSemaphore: { current: number; max: number } = { current: 0, max: 3 };

  private pubmedClient: PubMedClient | null = null;
  private googleScholarClient: GoogleScholarClient | null = null;
  private exaClient: ExaSearchClient | null = null;

  constructor(settings: any, graphRepo?: Neo4jGraphRepository) {
    super(settings);
    this.graphRepo = graphRepo || new Neo4jGraphRepository();
    this.maxIterations = settings.asr_got.default_parameters?.evidence_max_iterations || 5;
    this.ibnSimilarityThreshold = settings.asr_got.default_parameters?.ibn_similarity_threshold || 0.5;
    this.minNodesForHyperedgeConsideration = settings.asr_got.default_parameters?.min_nodes_for_hyperedge || 2;

    this.initializeApiClients();

    if (!this.pubmedClient && !this.googleScholarClient && !this.exaClient) {
      throw new Error(
        `No evidence sources available. Failed to initialize: ${this.executionLogs.join(', ')}`
      ); // Changed to generic Error for now
    }
  }

  private initializeApiClients(): void {
    const failures: string[] = [];

    // Initialize PubMed client
    try {
      this.pubmedClient = new PubMedClient(settings);
      logger.info("PubMed client initialized for EvidenceStage.");
    } catch (e: any) {
      const msg = `Failed to initialize PubMedClient: ${e.message}`;
      logger.error(msg);
      this.executionLogs.push(msg);
      failures.push("PubMed");
    }

    // Initialize Google Scholar client
    try {
      this.googleScholarClient = new GoogleScholarClient(settings);
      logger.info("Google Scholar client initialized for EvidenceStage.");
    } catch (e: any) {
      const msg = `Failed to initialize GoogleScholarClient: ${e.message}`;
      logger.error(msg);
      this.executionLogs.push(msg);
      failures.push("GoogleScholar");
    }

    // Initialize Exa Search client
    try {
      this.exaClient = new ExaSearchClient(settings);
      logger.info("Exa Search client initialized for EvidenceStage.");
    } catch (e: any) {
      const msg = `Failed to initialize ExaSearchClient: ${e.message}`;
      logger.error(msg);
      this.executionLogs.push(msg);
      failures.push("ExaSearch");
    }

    if (failures.length > 0) {
      logger.warn(`Some API clients failed to initialize: ${failures.join(', ')}. Evidence collection will use available clients and mock data where needed.`);
    }
  }

  async closeClients(): Promise<void> {
    logger.debug("Attempting to close API clients in EvidenceStage.");
    if (this.pubmedClient) {
      try {
        await this.pubmedClient.close();
        logger.debug("PubMed client closed.");
      } catch (e: any) {
        logger.error(`Error closing PubMed client: ${e.message}`);
      }
    }
    if (this.googleScholarClient) {
      try {
        await this.googleScholarClient.close();
        logger.debug("Google Scholar client closed.");
      } catch (e: any) {
        logger.error(`Error closing Google Scholar client: ${e.message}`);
      }
    }
    if (this.exaClient) {
      try {
        await this.exaClient.close();
        logger.debug("Exa Search client closed.");
      } catch (e: any) {
        logger.error(`Error closing Exa Search client: ${e.message}`);
      }
    }
  }

  private _deserializeTags(raw: any): Set<string> {
    if (raw === null || raw === undefined) {
      return new Set();
    }
    if (Array.isArray(raw)) {
      return new Set(raw);
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    } catch (e) {
      logger.warn(`Could not deserialize tags payload '${raw}'`);
    }
    return new Set();
  }

  private _buildSafeRelationshipQuery(
    sourceNodeId: string,
    targetNodeId: string,
    edgeType: EdgeType,
    properties: Record<string, any>
  ): { query: string; params: Record<string, any> } {
    validateRelationshipType(edgeType.valueOf());
    return buildSafeRelationshipQuery(sourceNodeId, targetNodeId, edgeType, properties);
  }

  private async _selectHypothesisToEvaluateFromNeo4j(
    hypothesisNodeIds: string[]
  ): Promise<Record<string, any> | null> {
    if (!hypothesisNodeIds || hypothesisNodeIds.length === 0) {
      return null;
    }
    const query = `
      UNWIND $hypothesis_ids AS hypo_id
      MATCH (h:Node:HYPOTHESIS {id: hypo_id})
      RETURN
          h.id AS id, h.label AS label, h.metadata_impact_score AS impact_score,
          h.confidence_empirical_support AS conf_empirical,
          h.confidence_theoretical_basis AS conf_theoretical,
          h.confidence_methodological_rigor AS conf_methodological,
          h.confidence_consensus_alignment AS conf_consensus,
          h.metadata_plan AS plan_json,
          h.metadata_layer_id AS layer_id,
          h.metadata_disciplinary_tags AS metadata_disciplinary_tags
      ORDER BY h.metadata_impact_score DESC, h.confidence_empirical_support ASC
      LIMIT 10
    `;
    try {
      const results = await this.graphRepo.executeQuery(
        query,
        { hypothesis_ids: hypothesisNodeIds },
        undefined,
        "read"
      );
      if (!results || results.length === 0) {
        return null;
      }
      const eligibleHypothesesData: Record<string, any>[] = [];
      for (const record of results) {
        const hypoData = { ...record };
        const confList = [
          hypoData.conf_empirical || 0.5,
          hypoData.conf_theoretical || 0.5,
          hypoData.conf_methodological || 0.5,
          hypoData.conf_consensus || 0.5,
        ];
        hypoData.confidence_vector_list = confList;
        eligibleHypothesesData.push(hypoData);
      }
      if (eligibleHypothesesData.length === 0) {
        return null;
      }

      const scoreHypothesisData = (hData: Record<string, any>): number => {
        const impact = hData.impact_score || 0.1;
        const confList = hData.confidence_vector_list || [0.5, 0.5, 0.5, 0.5];
        const confVariance = confList.reduce((sum: number, c: number) => sum + (c - 0.5) ** 2, 0) / 4.0;
        return impact + confVariance;
      };

      eligibleHypothesesData.sort((a, b) => scoreHypothesisData(b) - scoreHypothesisData(a));
      const selectedHypothesisData = eligibleHypothesesData[0];
      logger.debug(
        `Selected hypothesis '${selectedHypothesisData.label}' (ID: ${selectedHypothesisData.id}) from Neo4j for evidence integration.`
      );
      return selectedHypothesisData;
    } catch (e: any) {
      logger.error(`Neo4j error selecting hypothesis: ${e.message}`);
      return null;
    }
  }

  private async _executeHypothesisPlan(
    hypothesisDataFromNeo4j: Record<string, any>
  ): Promise<Record<string, any>[]> {
    const hypoLabel = hypothesisDataFromNeo4j.label || "";
    const hypoId = hypothesisDataFromNeo4j.id || "unknown_hypo";

    const planJsonStr = hypothesisDataFromNeo4j.plan_json;

    let searchQuery = hypoLabel;
    let planDetails = "using hypothesis label as query.";

    if (planJsonStr) {
      try {
        const planDict = JSON.parse(planJsonStr);
        searchQuery = planDict.query || hypoLabel;
        const planType = planDict.type || "default_plan";
        planDetails = `using query from plan ('${searchQuery}') of type '${planType}'.`;
      } catch (e) {
        logger.warn(`Could not parse plan_json for hypothesis ${hypoLabel}. Defaulting to label for query.`);
      }
    }

    logger.info(`Executing evidence plan for hypothesis '${hypoLabel}' (ID: ${hypoId}): ${planDetails}`);

    const foundEvidenceList: Record<string, any>[] = [];

    const defaultTags = this._deserializeTags(hypothesisDataFromNeo4j.metadata_disciplinary_tags);
    if (defaultTags.size === 0 && this.settings.asr_got.default_parameters) {
      this.settings.asr_got.default_parameters.default_disciplinary_tags.forEach((tag: string) => defaultTags.add(tag));
    }

    // --- PubMed Search ---
    if (this.pubmedClient) {
      try {
        await this._acquireApiSlot();
        logger.info(`Querying PubMed with: '${searchQuery}' for hypothesis ${hypoId}`);
        const pubmedArticles = await this.pubmedClient.searchArticles(searchQuery, 2);
        for (const article of pubmedArticles) {
          let content = article.title;
          if (article.abstract) {
            content += ` | Abstract (preview): ${article.abstract.substring(0, 250)}...`;
          }

          const supportAnalysis = this._analyzeEvidenceSupport(article.title, article.abstract || '', hypoLabel);
          const evidenceItem = {
            content: content,
            source_description: "PubMed Search Result",
            url: article.url,
            doi: article.doi,
            authors_list: article.authors,
            publication_date_str: article.publication_date,
            supports_hypothesis: supportAnalysis.supports,
            strength: supportAnalysis.confidence,
            statistical_power: StatisticalPowerSchema.parse({
              value: 0.6, method_description: "Default placeholder SP."
            }),
            disciplinary_tags: Array.from(defaultTags),
            timestamp: new Date(),
            raw_source_data_type: "PubMedArticle",
            original_data: article,
          };
          foundEvidenceList.push(evidenceItem);
        }
        logger.info(`Found ${pubmedArticles.length} articles from PubMed for '${searchQuery}'.`);
      } catch (e: any) {
        logger.error(`Error querying PubMed for '${searchQuery}': ${e.message}`);
      } finally {
        this._releaseApiSlot();
      }
    }

    // --- Google Scholar Search ---
    if (this.googleScholarClient) {
      try {
        await this._acquireApiSlot();
        logger.info(`Querying Google Scholar with: '${searchQuery}' for hypothesis ${hypoId}`);
        const gsArticles = await this.googleScholarClient.search(searchQuery, 2);
        for (const article of gsArticles) {
          let content = article.title;
          if (article.snippet) {
            content += ` | Snippet: ${article.snippet}`;
          }

          let doiCandidate: string | undefined = undefined;
          if (article.link && article.link.includes("doi.org/")) {
            doiCandidate = article.link.split("doi.org/")[1];
          }

          const authorsListGs = article.authors ? article.authors.split(',').map(a => a.trim()) : [];

          const supportAnalysis = this._analyzeEvidenceSupport(article.title, article.snippet || '', hypoLabel);
          const evidenceItem = {
            content: content,
            source_description: "Google Scholar Search Result",
            url: article.link,
            doi: doiCandidate,
            authors_list: authorsListGs,
            publication_date_str: article.publication_info,
            supports_hypothesis: supportAnalysis.supports,
            strength: Math.max(0.1, Math.min(0.9, supportAnalysis.confidence + (article.cited_by_count ? article.cited_by_count / 500 : 0))),
            statistical_power: StatisticalPowerSchema.parse({
              value: 0.5, method_description: "Default placeholder SP."
            }),
            disciplinary_tags: Array.from(defaultTags),
            timestamp: new Date(),
            raw_source_data_type: "GoogleScholarArticle",
            original_data: article,
          };
          foundEvidenceList.push(evidenceItem);
        }
        logger.info(`Found ${gsArticles.length} articles from Google Scholar for '${searchQuery}'.`);
      } catch (e: any) {
        if (e instanceof UnexpectedResponseStructureError) {
          logger.warn(`Google Scholar returned unexpected structure for '${searchQuery}': ${e.message}`);
        } else {
          logger.error(`Error querying Google Scholar for '${searchQuery}': ${e.message}`);
        }
      } finally {
        this._releaseApiSlot();
      }
    }

    // --- Exa Search ---
    if (this.exaClient) {
      try {
        await this._acquireApiSlot();
        logger.info(`Querying Exa Search with: '${searchQuery}' for hypothesis ${hypoId}`);
        const exaResults = await this.exaClient.search(searchQuery, 2, "neural");
        for (const result of exaResults) {
          let content = result.title || "Untitled Exa Result";
          if (result.highlights) {
            content += ` | Highlight: ${result.highlights[0]}`;
          }

          const authorsListExa = result.author ? [result.author] : [];

          const supportAnalysis = this._analyzeEvidenceSupport(result.title || '', result.highlights?.join(' ') || '', hypoLabel);
          const evidenceItem = {
            content: content,
            source_description: "Exa Search Result",
            url: result.url,
            doi: '',
            authors_list: authorsListExa,
            publication_date_str: result.published_date,
            supports_hypothesis: supportAnalysis.supports,
            strength: result.score !== undefined ? Math.max(0.1, Math.min(0.9, result.score * supportAnalysis.confidence)) : supportAnalysis.confidence,
            statistical_power: StatisticalPowerSchema.parse({
              value: 0.5, method_description: "Default placeholder SP."
            }),
            disciplinary_tags: Array.from(defaultTags),
            timestamp: new Date(),
            raw_source_data_type: "ExaArticleResult",
            original_data: result,
          };
          foundEvidenceList.push(evidenceItem);
        }
        logger.info(`Found ${exaResults.length} results from Exa Search for '${searchQuery}'.`);
      } catch (e: any) {
        logger.error(`Error querying Exa Search for '${searchQuery}': ${e.message}`);
      } finally {
        this._releaseApiSlot();
      }
    }

    logger.info(`Total evidence pieces found for hypothesis '${hypoLabel}': ${foundEvidenceList.length}`);
    return foundEvidenceList;
  }

  private async _createEvidenceInNeo4j(
    hypothesisData: Record<string, any>,
    evidenceData: Record<string, any>,
    iteration: number,
    evidenceIndex: number,
  ): Promise<Record<string, any> | null> {
    const hypothesisId = hypothesisData.id;
    const hypothesisLabel = hypothesisData.label || "N/A";
    const hypothesisLayerId = hypothesisData.layer_id || (this.settings.asr_got.default_parameters?.initial_layer || "unknown_layer");

    const evidenceId = `ev_${hypothesisId}_${iteration}_${evidenceIndex}_${uuidv4()}`;
    const edgeType = evidenceData.supports_hypothesis ? EdgeType.SUPPORTIVE : EdgeType.CONTRADICTORY;

    const spValue = (evidenceData.statistical_power && typeof evidenceData.statistical_power.value === 'number') ? evidenceData.statistical_power.value : 0.5;

    const evidenceMetadata: NodeMetadata = {
      description: evidenceData.content || "N/A",
      query_context: '', // Not directly from evidenceData
      source_description: evidenceData.source_description || "N/A",
      epistemic_status: evidenceData.supports_hypothesis ? EpistemicStatus.EVIDENCE_SUPPORTED : EpistemicStatus.EVIDENCE_CONTRADICTED,
      disciplinary_tags: (evidenceData.disciplinary_tags || []).join(','),
      layer_id: hypothesisLayerId,
      impact_score: (evidenceData.strength || 0.5) * spValue,
      is_knowledge_gap: false,
      id: uuidv4(), // Will be overwritten
      doi: evidenceData.doi || '',
      authors: (evidenceData.authors_list || []).join(','),
      publication_date: evidenceData.publication_date_str || '',
      revision_history: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const evidenceConfidenceVec = ConfidenceVectorSchema.parse({
      empirical_support: evidenceData.strength || 0.5,
      methodological_rigor: evidenceData.methodological_rigor || (evidenceData.strength || 0.5) * 0.8,
      theoretical_basis: 0.5,
      consensus_alignment: 0.5,
    });

    const evidenceNode: Node = createNode({
      id: evidenceId,
      label: `Evidence ${evidenceIndex + 1} for H: ${hypothesisLabel.substring(0, 20)}...`,
      type: NodeType.EVIDENCE,
      confidence: evidenceConfidenceVec,
      metadata: evidenceMetadata,
    });

    const evPropsForNeo4j = prepareNodePropertiesForNeo4j(evidenceNode);
    evPropsForNeo4j.metadata_timestamp_iso = (evidenceData.timestamp || new Date()).toISOString();
    evPropsForNeo4j.metadata_raw_source_data_type = evidenceData.raw_source_data_type;
    evPropsForNeo4j.metadata_original_data_dump = JSON.stringify(evidenceData.original_data);

    const createEvNodeQuery = `
      MERGE (e:Node {id: $props.id}) SET e += $props
      WITH e, $type_label AS typeLabel CALL apoc.create.addLabels(e, [typeLabel]) YIELD node
      RETURN node.id AS evidence_id, properties(node) as evidence_props
    `;
    try {
      const resultEvNode = await this.graphRepo.executeQuery(
        createEvNodeQuery,
        { props: evPropsForNeo4j, type_label: NodeType.EVIDENCE.valueOf() },
        undefined,
        "write"
      );
      if (!resultEvNode || resultEvNode.length === 0 || !resultEvNode[0].evidence_id) {
        logger.error(`Failed to create evidence node ${evidenceId} in Neo4j.`);
        return null;
      }

      const createdEvidenceId = resultEvNode[0].evidence_id;
      const createdEvidenceProps = resultEvNode[0].evidence_props;

      const edgeToHypoId = `edge_ev_${createdEvidenceId}_${hypothesisId}_${uuidv4()}`;
      const edge: Edge = {
        id: edgeToHypoId,
        source_id: createdEvidenceId,
        target_id: hypothesisId,
        type: edgeType,
        confidence: evidenceData.strength || 0.5,
        metadata: { description: `Evidence '${evidenceNode.label.substring(0, 20)}...' ${evidenceData.supports_hypothesis ? 'supports' : 'contradicts'} hypothesis.`, weight: 1.0, created_at: new Date(), updated_at: new Date() },
        created_at: new Date(),
        updated_at: new Date(),
      };
      const edgePropsForNeo4j = prepareEdgePropertiesForNeo4j(edge);

      const { query: createRelQuery, params: paramsRel } = this._buildSafeRelationshipQuery(
        createdEvidenceId,
        hypothesisId,
        edgeType,
        edgePropsForNeo4j
      );
      const resultRel = await this.graphRepo.executeQuery(
        createRelQuery, paramsRel, undefined, "write"
      );
      if (!resultRel || resultRel.length === 0 || !resultRel[0].rel_id) {
        logger.error(`Failed to link evidence ${createdEvidenceId} to hypothesis ${hypothesisId}.`);
        return null;
      }

      logger.debug(`Created evidence node ${createdEvidenceId} and linked to hypothesis ${hypothesisId} with type ${edgeType.valueOf()}.`);
      return { id: createdEvidenceId, ...createdEvidenceProps };
    } catch (e: any) {
      logger.error(`Neo4j error creating evidence or link: ${e.message}`, e);
      return null;
    }
  }

  private async _updateHypothesisConfidenceInNeo4j(
    hypothesisId: string,
    priorConfidenceObj: any, // Should be ConfidenceVector
    evidenceStrength: number,
    supportsHypothesis: boolean,
    statisticalPower: any, // Should be StatisticalPower
    edgeType: EdgeType,
  ): Promise<boolean> {
    const priorConfidenceVector = {
      empirical_support: priorConfidenceObj.empirical_support || 0.5,
      theoretical_basis: priorConfidenceObj.theoretical_basis || 0.5,
      methodological_rigor: priorConfidenceObj.methodological_rigor || 0.5,
      consensus_alignment: priorConfidenceObj.consensus_alignment || 0.5,
    };
    const updateResult = bayesianUpdateConfidence(priorConfidenceVector, evidenceStrength, supportsHypothesis);

    const updatedConfidence = ConfidenceVectorSchema.parse({
      empirical_support: updateResult.updatedConfidence.empirical_support,
      theoretical_basis: updateResult.updatedConfidence.theoretical_basis,
      methodological_rigor: updateResult.updatedConfidence.methodological_rigor,
      consensus_alignment: updateResult.updatedConfidence.consensus_alignment,
    });

    const updateQuery = `
      MATCH (h:Node:HYPOTHESIS {id: $id})
      SET h.confidence_empirical_support = $confidence_empirical_support,
          h.confidence_theoretical_basis = $confidence_theoretical_basis,
          h.confidence_methodological_rigor = $confidence_methodological_rigor,
          h.confidence_consensus_alignment = $confidence_consensus_alignment,
          h.updated_at = datetime()
      RETURN h.id
    `;
    const params = {
      id: hypothesisId,
      confidence_empirical_support: updatedConfidence.empirical_support,
      confidence_theoretical_basis: updatedConfidence.theoretical_basis,
      confidence_methodological_rigor: updatedConfidence.methodological_rigor,
      confidence_consensus_alignment: updatedConfidence.consensus_alignment,
    };
    try {
      await this.graphRepo.executeQuery(updateQuery, params, undefined, "write");
      return true;
    } catch (e: any) {
      logger.error(`Neo4j error updating hypothesis confidence ${hypothesisId}: ${e.message}`);
      return false;
    }
  }

  private async _createIbnInNeo4j(
    evidenceNodeData: Record<string, any>,
    hypothesisNodeData: Record<string, any>
  ): Promise<string | null> {
    const hypoTagsRaw = hypothesisNodeData.metadata_disciplinary_tags;
    const evTagsRaw = evidenceNodeData.metadata_disciplinary_tags;

    const hypoTags = this._deserializeTags(hypoTagsRaw);
    const evTags = this._deserializeTags(evTagsRaw);

    if (!hypoTags.size || !evTags.size || !Array.from(hypoTags).some(tag => evTags.has(tag))) { // Check if NO intersection exists
      return null;
    }

    const hypoLabelForSim = hypothesisNodeData.label || "";
    const evLabelForSim = evidenceNodeData.label || "";
    const similarity = calculateSemanticSimilarity(hypoLabelForSim, evLabelForSim);
    if (similarity < this.ibnSimilarityThreshold) {
      return null;
    }

    const ibnId = `ibn_${evidenceNodeData.id}_${hypothesisNodeData.id}_${uuidv4()}`;
    const ibnLabel = `IBN: ${evLabelForSim.substring(0, 20)}... <=> ${hypoLabelForSim.substring(0, 20)}...`;

    const combinedTags = new Set([...hypoTags, ...evTags]);

    const ibnMetadata: NodeMetadata = {
      description: `Interdisciplinary bridge between domains ${Array.from(hypoTags).join(', ')} and ${Array.from(evTags).join(', ')}.`, 
      query_context: '',
      source_description: "EvidenceStage IBN Creation (P1.8)",
      epistemic_status: EpistemicStatus.INFERRED,
      disciplinary_tags: Array.from(combinedTags).join(','),
      layer_id: evidenceNodeData.metadata_layer_id || (this.settings.asr_got.default_parameters?.initial_layer || "unknown_layer"),
      impact_score: 0.6,
      is_knowledge_gap: false,
      id: uuidv4(), // Will be overwritten
      doi: '',
      authors: '',
      publication_date: '',
      revision_history: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const ibnNode: Node = createNode({
      id: ibnId,
      label: ibnLabel,
      type: NodeType.INTERDISCIPLINARY_BRIDGE,
      confidence: ConfidenceVectorSchema.parse({
        empirical_support: similarity,
        theoretical_basis: 0.4,
        methodological_rigor: 0.5,
        consensus_alignment: 0.3,
      }),
      metadata: ibnMetadata,
    });

    const ibnProps = prepareNodePropertiesForNeo4j(ibnNode);
    ibnProps.metadata_interdisciplinary_info = JSON.stringify({
      source_disciplines: Array.from(hypoTags),
      target_disciplines: Array.from(evTags),
      bridging_concept: `Connection between '${evLabelForSim.substring(0, 20)}' and '${hypoLabelForSim.substring(0, 20)}'`,
    });

    try {
      const createIbnQuery = `
        MERGE (ibn:Node {id: $props.id}) SET ibn += $props
        WITH ibn, $type_label AS typeLabel CALL apoc.create.addLabels(ibn, [typeLabel]) YIELD node
        RETURN node.id AS ibn_created_id
      `;
      const resultIbn = await this.graphRepo.executeQuery(
        createIbnQuery,
        { props: ibnProps, type_label: NodeType.INTERDISCIPLINARY_BRIDGE.valueOf() },
        undefined,
        "write"
      );
      if (!resultIbn || resultIbn.length === 0 || !resultIbn[0].ibn_created_id) {
        logger.error(`Failed to create IBN node ${ibnId} in Neo4j.`);
        return null;
      }
      const createdIbnId = resultIbn[0].ibn_created_id;

      const edge1Id = `edge_${evidenceNodeData.id}_${EdgeType.IBN_SOURCE_LINK.valueOf()}_${createdIbnId}_${uuidv4()}`;
      const edge1: Edge = {
        id: edge1Id,
        source_id: evidenceNodeData.id,
        target_id: createdIbnId,
        type: EdgeType.IBN_SOURCE_LINK,
        confidence: 0.8,
        metadata: { description: '', weight: 1.0, created_at: new Date(), updated_at: new Date() },
        created_at: new Date(),
        updated_at: new Date(),
      };
      const edge1Props = prepareEdgePropertiesForNeo4j(edge1);

      const edge2Id = `edge_${createdIbnId}_${EdgeType.IBN_TARGET_LINK.valueOf()}_${hypothesisNodeData.id}_${uuidv4()}`;
      const edge2: Edge = {
        id: edge2Id,
        source_id: createdIbnId,
        target_id: hypothesisNodeData.id,
        type: EdgeType.IBN_TARGET_LINK,
        confidence: 0.8,
        metadata: { description: '', weight: 1.0, created_at: new Date(), updated_at: new Date() },
        created_at: new Date(),
        updated_at: new Date(),
      };
      const edge2Props = prepareEdgePropertiesForNeo4j(edge2);

      const linkIbnQuery = `
        MATCH (ev_node:Node {id: $ev_id})
        MATCH (ibn_node:Node {id: $ibn_id})
        MATCH (hypo_node:Node {id: $hypo_id})
        MERGE (ev_node)-[r1:ibn_source_link {id: $edge1_props.id}]->(ibn_node) SET r1 += $edge1_props
        MERGE (ibn_node)-[r2:ibn_target_link {id: $edge2_props.id}]->(hypo_node) SET r2 += $edge2_props
        RETURN r1.id AS r1_id, r2.id AS r2_id
      `;
      const paramsLink = {
        ev_id: evidenceNodeData.id,
        ibn_id: createdIbnId,
        hypo_id: hypothesisNodeData.id,
        edge1_props: edge1Props,
        edge2_props: edge2Props,
      };
      const linkResults = await this.graphRepo.executeQuery(
        linkIbnQuery, paramsLink, undefined, "write"
      );
      if (!linkResults || linkResults.length === 0 || !linkResults[0].r1_id || !linkResults[0].r2_id) {
        logger.error(`Failed to link IBN ${createdIbnId} to evidence/hypothesis.`);
        return null;
      }

      logger.info(`Created IBN ${createdIbnId} and linked it between ${evidenceNodeData.id} and ${hypothesisNodeData.id}.`);
      return createdIbnId;
    } catch (e: any) {
      logger.error(`Neo4j error during IBN creation or linking for ${ibnId}: ${e.message}`, e);
      return null;
    }
  }

  private async _createHyperedgesInNeo4j(
    hypothesisData: Record<string, any>,
    relatedEvidenceDataList: Record<string, any>[],
  ): Promise<string[]> {
    const createdHyperedgeIds: string[] = [];
    const minNodesForHyperedge = this.minNodesForHyperedgeConsideration;

    if (relatedEvidenceDataList.length < minNodesForHyperedge) {
      return createdHyperedgeIds;
    }

    const hyperedgeCenterId = `hyper_${hypothesisData.id}_${uuidv4()}`;
    const hyperedgeNodeIdsForPydantic = new Set<string>([hypothesisData.id]);
    relatedEvidenceDataList.forEach(evData => hyperedgeNodeIdsForPydantic.add(evData.id));

    const hypoConfEmp = hypothesisData.conf_empirical || 0.5;
    const avgEmpSupport = (
      hypoConfEmp +
      relatedEvidenceDataList.reduce((sum, ev) => sum + (ev.confidence_empirical_support || 0.5), 0)
    ) / (1 + relatedEvidenceDataList.length);

    const hyperConfidence = ConfidenceVectorSchema.parse({
      empirical_support: avgEmpSupport,
      theoretical_basis: 0.4,
      methodological_rigor: 0.5,
      consensus_alignment: 0.4,
    });

    const hyperedgeNodeMetadata: NodeMetadata = {
      description: `Joint influence on hypothesis ${hypothesisData.label?.substring(0, 20)}...`,
      query_context: '',
      source_description: '',
      epistemic_status: EpistemicStatus.INFERRED,
      disciplinary_tags: '',
      layer_id: hypothesisData.layer_id || (this.settings.asr_got.default_parameters?.initial_layer || "unknown_layer"),
      impact_score: 0.0,
      is_knowledge_gap: false,
      id: uuidv4(), // Will be overwritten
      doi: '',
      authors: '',
      publication_date: '',
      revision_history: [],
      created_at: new Date(),
      updated_at: new Date(),
    };
    // Add misc_properties equivalent
    (hyperedgeNodeMetadata as any).misc_properties = { relationship_descriptor: "Joint Support/Contradiction (Simulated)" };

    const hyperedgeCenterNode: Node = createNode({
      id: hyperedgeCenterId,
      label: `Hyperedge for ${hypothesisData.label?.substring(0, 20)}`,
      type: NodeType.HYPEREDGE_CENTER,
      confidence: hyperConfidence,
      metadata: hyperedgeNodeMetadata,
    });

    const centerNodeProps = prepareNodePropertiesForNeo4j(hyperedgeCenterNode);

    try {
      const createCenterQuery = `
        MERGE (hc:Node {id: $props.id}) SET hc += $props
        WITH hc, $type_label AS typeLabel CALL apoc.create.addLabels(hc, [typeLabel]) YIELD node
        RETURN node.id AS hyperedge_center_created_id
      `;
      const resultCenter = await this.graphRepo.executeQuery(
        createCenterQuery,
        { props: centerNodeProps, type_label: NodeType.HYPEREDGE_CENTER.valueOf() },
        undefined,
        "write"
      );
      if (!resultCenter || resultCenter.length === 0 || !resultCenter[0].hyperedge_center_created_id) {
        logger.error(`Failed to create hyperedge center node ${hyperedgeCenterId}.`);
        return createdHyperedgeIds;
      }
      const createdHyperedgeCenterId = resultCenter[0].hyperedge_center_created_id;

      const batchMemberLinksData: any[] = [];
      for (const memberId of Array.from(hyperedgeNodeIdsForPydantic)) {
        const edgeId = `edge_hyper_${createdHyperedgeCenterId}_hasmember_${memberId}_${uuidv4()}`;
        batchMemberLinksData.push({
          hyperedge_center_id: createdHyperedgeCenterId,
          member_node_id: memberId,
          props: { id: edgeId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        });
      }

      if (batchMemberLinksData.length > 0) {
        const linkMembersQuery = `
          UNWIND $links AS link_data
          MATCH (hc:Node {id: link_data.hyperedge_center_id})
          MATCH (member:Node {id: link_data.member_node_id})
          MERGE (hc)-[r:HAS_MEMBER {id: link_data.props.id}]->(member) SET r += link_data.props
          RETURN count(r) AS total_links_created
        `;
        const linkResults = await this.graphRepo.executeQuery(
          linkMembersQuery,
          { links: batchMemberLinksData },
          undefined,
          "write"
        );
        if (linkResults && linkResults.length > 0 && linkResults[0].total_links_created !== undefined) {
          logger.debug(`Batch created ${linkResults[0].total_links_created} HAS_MEMBER links for hyperedge ${createdHyperedgeCenterId}.`);
        } else {
          logger.error(`Failed to get count from batch hyperedge member linking for ${createdHyperedgeCenterId}.`);
        }
      }
      createdHyperedgeIds.push(createdHyperedgeCenterId);
      logger.info(`Created Hyperedge (center node ${createdHyperedgeCenterId}) for hypothesis ${hypothesisData.id} and ${relatedEvidenceDataList.length} evidence nodes.`);
    } catch (e: any) {
      logger.error(`Neo4j error creating hyperedge or linking members for hypothesis ${hypothesisData.id}: ${e.message}`, e);
    }
    return createdHyperedgeIds;
  }

  private async _applyTemporalDecayAndPatterns(): Promise<void> {
    logger.debug("Temporal decay and pattern detection - placeholder.");
    // This would involve fetching nodes, calculating decay, and persisting updates.
    // For now, it's a no-op.
  }

  private async _adaptGraphTopology(): Promise<void> {
    logger.debug("Dynamic graph topology adaptation - placeholder.");
    // This would involve creating hyperedges, removing redundant edges, and simplifying the graph.
    // For now, it's a no-op.
  }

  private async _acquireApiSlot(): Promise<void> {
    while (this.apiCallSemaphore.current >= this.apiCallSemaphore.max) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.apiCallSemaphore.current++;
  }

  private _releaseApiSlot(): void {
    this.apiCallSemaphore.current = Math.max(0, this.apiCallSemaphore.current - 1);
  }

  private _analyzeEvidenceSupport(evidenceTitle: string, evidenceAbstract: string, hypothesisLabel: string): { supports: boolean; confidence: number } {
    // Robust evidence analysis to determine if evidence supports hypothesis
    const evidence = `${evidenceTitle} ${evidenceAbstract}`.toLowerCase();
    const hypothesis = hypothesisLabel.toLowerCase();
    
    // Enhanced contradictory terms with weights
    const strongContradictoryTerms = ['disprove', 'refute', 'contradict', 'falsify', 'invalidate'];
    const moderateContradictoryTerms = ['not', 'no', 'fail', 'contrary', 'against', 'oppose', 'invalid', 'incorrect', 'wrong'];
    const weakContradictoryTerms = ['however', 'but', 'although', 'despite'];
    
    // Enhanced supportive terms with weights
    const strongSupportiveTerms = ['prove', 'demonstrate', 'confirm', 'validate', 'establish', 'corroborate'];
    const moderateSupportiveTerms = ['support', 'show', 'indicate', 'suggest', 'evidence', 'consistent', 'align'];
    const weakSupportiveTerms = ['may', 'could', 'might', 'possible', 'potential'];
    
    let supportScore = 0;
    let contradictScore = 0;
    
    // Count contradictory patterns with weights
    strongContradictoryTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) contradictScore += matches.length * 3; // Strong weight
    });
    
    moderateContradictoryTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) contradictScore += matches.length * 2; // Moderate weight
    });
    
    weakContradictoryTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) contradictScore += matches.length * 1; // Weak weight
    });
    
    // Count supportive patterns with weights
    strongSupportiveTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) supportScore += matches.length * 3; // Strong weight
    });
    
    moderateSupportiveTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) supportScore += matches.length * 2; // Moderate weight
    });
    
    weakSupportiveTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = evidence.match(regex);
      if (matches) supportScore += matches.length * 1; // Weak weight
    });
    
    // Check for negation patterns that could flip meaning
    const negationPatterns = [
      /\b(not|no|never|neither|nor|none)\s+\w*\s*(support|confirm|validate|prove)/gi,
      /\b(fail|failed|fails)\s+to\s+(support|confirm|validate|prove)/gi,
      /\b(does not|doesn't|cannot|can't)\s+\w*\s*(support|confirm|validate|prove)/gi
    ];
    
    negationPatterns.forEach(pattern => {
      const matches = evidence.match(pattern);
      if (matches) {
        // Negated supportive language becomes contradictory
        contradictScore += matches.length * 2;
        supportScore = Math.max(0, supportScore - matches.length * 2);
      }
    });
    
    // Semantic similarity (more sophisticated)
    const hypothesisWords = hypothesis.split(/\s+/)
      .filter(word => word.length > 3 && !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'will', 'were', 'would'].includes(word));
    const evidenceWords = evidence.split(/\s+/)
      .filter(word => word.length > 3 && !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'will', 'were', 'would'].includes(word));
    
    const overlap = hypothesisWords.filter(word => evidenceWords.includes(word)).length;
    const semanticScore = hypothesisWords.length > 0 ? (overlap / hypothesisWords.length) * 2 : 0; // Normalize and scale
    
    // Calculate net score with semantic context
    const netScore = supportScore - contradictScore + semanticScore;
    
    // Implement threshold-based decision with neutral zone
    let supports: boolean;
    let confidence: number;
    
    if (netScore > 1.5) {
      // Clear support
      supports = true;
      confidence = Math.min(0.9, 0.5 + (netScore / 10));
    } else if (netScore < -1.5) {
      // Clear contradiction
      supports = false;
      confidence = Math.min(0.9, 0.5 + (Math.abs(netScore) / 10));
    } else {
      // Neutral/ambiguous zone - default to slight support but with low confidence
      supports = netScore >= 0;
      confidence = 0.3; // Low confidence for ambiguous cases
    }
    
    // Ensure minimum confidence
    confidence = Math.max(0.1, confidence);
    
    logger.debug(`Evidence analysis for "${evidenceTitle.substring(0, 50)}...": support=${supportScore}, contradict=${contradictScore}, semantic=${semanticScore.toFixed(2)}, net=${netScore.toFixed(2)} → supports=${supports}, confidence=${confidence.toFixed(2)}`);
    
    return { supports, confidence };
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  async execute(
    currentSessionData: GoTProcessorSessionData
  ): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);
    const hypothesisData = currentSessionData.accumulated_context[HypothesisStage.STAGE_NAME] || {};
    const hypothesisNodeIds: string[] = hypothesisData.hypothesis_node_ids || [];

    let evidenceCreatedCount = 0;
    let hypothesesUpdatedCount = 0;
    let ibnsCreatedCount = 0;
    let hyperedgesCreatedCount = 0;
    let iterationsRun = 0;

    try {
      if (hypothesisNodeIds.length === 0) {
        logger.warn("No hypothesis IDs found. Skipping evidence stage.");
        const summary = "Evidence skipped: No hypotheses.";
        const metrics = {
          iterations_completed: 0,
          evidence_nodes_created_in_neo4j: 0,
          hypotheses_updated_in_neo4j: 0,
          ibns_created_in_neo4j: 0,
          hyperedges_created_in_neo4j: 0,
        };
        const contextUpdate = {
          evidence_integration_completed: false,
          error: "No hypotheses found",
        };
        return new StageOutput(
          false,
          summary,
          { [this.stageName]: contextUpdate },
          "No hypotheses",
          metrics
        );
      }

      const processedHypothesesThisRun: Set<string> = new Set();
      for (let iterationNum = 0; iterationNum < this.maxIterations; iterationNum++) {
        iterationsRun = iterationNum + 1;
        logger.info(`Evidence integration iteration ${iterationsRun}/${this.maxIterations}`);

        const eligibleIdsForSelection = hypothesisNodeIds.filter(
          (hid) => !processedHypothesesThisRun.has(hid)
        );
        if (eligibleIdsForSelection.length === 0) {
          logger.info("All hypotheses processed or no eligible ones left for this run.");
          break;
        }

        const selectedHypothesisData = await this._selectHypothesisToEvaluateFromNeo4j(
          eligibleIdsForSelection
        );
        if (!selectedHypothesisData) {
          logger.info("No more eligible hypotheses to evaluate in this iteration loop.");
          break;
        }

        const currentHypothesisId = selectedHypothesisData.id;
        processedHypothesesThisRun.add(currentHypothesisId);

        const foundEvidenceConceptualList = await this._executeHypothesisPlan(
          selectedHypothesisData
        );

        if (foundEvidenceConceptualList.length === 0) {
          logger.debug(`No new evidence found/generated for hypothesis '${selectedHypothesisData.label || currentHypothesisId}'.`);
          continue;
        }

        const relatedEvidenceDataForHyperedge: Record<string, any>[] = [];
        for (let evIdx = 0; evIdx < foundEvidenceConceptualList.length; evIdx++) {
          const evConceptualData = foundEvidenceConceptualList[evIdx];
          const createdEvidenceNeo4jData = await this._createEvidenceInNeo4j(
            selectedHypothesisData,
            evConceptualData,
            iterationNum,
            evIdx,
          );
          if (!createdEvidenceNeo4jData) {
            logger.warn(`Failed to create Neo4j data for one piece of evidence for hypothesis ${currentHypothesisId}.`);
            continue;
          }
          evidenceCreatedCount++;
          relatedEvidenceDataForHyperedge.push(createdEvidenceNeo4jData);

          const priorConfidenceList = selectedHypothesisData.confidence_vector_list || [0.5, 0.5, 0.5, 0.5];
          const priorHypoConfidenceObj = ConfidenceVectorSchema.parse({
            empirical_support: priorConfidenceList[0],
            theoretical_basis: priorConfidenceList[1],
            methodological_rigor: priorConfidenceList[2],
            consensus_alignment: priorConfidenceList[3],
          });

          const edgeTypeForUpdate = evConceptualData.supports_hypothesis ? EdgeType.SUPPORTIVE : EdgeType.CONTRADICTORY;
          const updateSuccessful = await this._updateHypothesisConfidenceInNeo4j(
            currentHypothesisId,
            priorHypoConfidenceObj,
            evConceptualData.strength || 0.5,
            evConceptualData.supports_hypothesis,
            evConceptualData.statistical_power,
            edgeTypeForUpdate,
          );
          if (updateSuccessful) {
            hypothesesUpdatedCount++;
          }

          const ibnCreatedId = await this._createIbnInNeo4j(
            createdEvidenceNeo4jData, selectedHypothesisData
          );
          if (ibnCreatedId) {
            ibnsCreatedCount++;
          }
        }

        if (relatedEvidenceDataForHyperedge.length > 0) {
          const hyperedgeIds = await this._createHyperedgesInNeo4j(
            selectedHypothesisData, relatedEvidenceDataForHyperedge
          );
          hyperedgesCreatedCount += hyperedgeIds.length;
        }
      }

      await this._applyTemporalDecayAndPatterns();
      await this._adaptGraphTopology();

    } finally {
      await this.closeClients();
    }

    const summary = `Evidence integration completed. Iterations run: ${iterationsRun}. Evidence created: ${evidenceCreatedCount}. Hypotheses updated: ${hypothesesUpdatedCount}. IBNs created: ${ibnsCreatedCount}. Hyperedges created: ${hyperedgesCreatedCount}.`;
    const metrics = {
      iterations_completed: iterationsRun,
      evidence_nodes_created_in_neo4j: evidenceCreatedCount,
      hypotheses_updated_in_neo4j: hypothesesUpdatedCount,
      ibns_created_in_neo4j: ibnsCreatedCount,
      hyperedges_created_in_neo4j: hyperedgesCreatedCount,
    };
    const contextUpdate = {
      evidence_integration_completed: true,
      evidence_nodes_added_count: evidenceCreatedCount,
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
