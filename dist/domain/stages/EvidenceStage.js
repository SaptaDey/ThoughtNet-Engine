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
exports.EvidenceStage = void 0;
const uuid_1 = require("uuid");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const common_1 = require("../models/common");
const baseStage_1 = require("./baseStage");
const neo4jHelpers_1 = require("../utils/neo4jHelpers");
const hypothesisStage_1 = require("./hypothesisStage");
const cypherValidation_1 = require("../../utils/cypherValidation");
const pubmedClient_1 = require("../../infrastructure/apiClients/pubmedClient");
const googleScholarClient_1 = require("../../infrastructure/apiClients/googleScholarClient");
const exaSearchClient_1 = require("../../infrastructure/apiClients/exaSearchClient");
const mathHelpers_1 = require("../utils/mathHelpers");
const metadataHelpers_1 = require("../utils/metadataHelpers");
const neo4jGraphRepository_1 = require("../../infrastructure/neo4jGraphRepository");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class EvidenceStage extends baseStage_1.BaseStage {
    constructor(settings, graphRepo) {
        var _a, _b, _c;
        super(settings);
        this.stageName = EvidenceStage.STAGE_NAME;
        this.executionLogs = [];
        this.apiCallSemaphore = { current: 0, max: 3 };
        this.pubmedClient = null;
        this.googleScholarClient = null;
        this.exaClient = null;
        this.graphRepo = graphRepo || new neo4jGraphRepository_1.Neo4jGraphRepository();
        this.maxIterations = ((_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.evidence_max_iterations) || 5;
        this.ibnSimilarityThreshold = ((_b = settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.ibn_similarity_threshold) || 0.5;
        this.minNodesForHyperedgeConsideration = ((_c = settings.asr_got.default_parameters) === null || _c === void 0 ? void 0 : _c.min_nodes_for_hyperedge) || 2;
        this.initializeApiClients();
        if (!this.pubmedClient && !this.googleScholarClient && !this.exaClient) {
            throw new Error(`No evidence sources available. Failed to initialize: ${this.executionLogs.join(', ')}`); // Changed to generic Error for now
        }
    }
    initializeApiClients() {
        const failures = [];
        if (config_1.settings.pubmed && config_1.settings.pubmed.base_url) {
            try {
                this.pubmedClient = new pubmedClient_1.PubMedClient(config_1.settings);
                logger.info("PubMed client initialized for EvidenceStage.");
            }
            catch (e) {
                const msg = `Failed to initialize PubMedClient: ${e.message}`;
                logger.error(msg);
                this.executionLogs.push(msg);
                failures.push("PubMed");
            }
        }
        else {
            logger.warn("PubMed client not initialized for EvidenceStage: PubMed configuration missing or incomplete.");
        }
        if (config_1.settings.google_scholar && config_1.settings.google_scholar.api_key && config_1.settings.google_scholar.base_url) {
            try {
                this.googleScholarClient = new googleScholarClient_1.GoogleScholarClient(config_1.settings);
                logger.info("Google Scholar client initialized for EvidenceStage.");
            }
            catch (e) {
                const msg = `Failed to initialize GoogleScholarClient: ${e.message}`;
                logger.error(msg);
                this.executionLogs.push(msg);
                failures.push("GoogleScholar");
            }
        }
        else {
            logger.warn("Google Scholar client not initialized for EvidenceStage: Google Scholar configuration missing or incomplete (requires api_key and base_url).");
        }
        if (config_1.settings.exa_search && config_1.settings.exa_search.api_key && config_1.settings.exa_search.base_url) {
            try {
                this.exaClient = new exaSearchClient_1.ExaSearchClient(config_1.settings);
                logger.info("Exa Search client initialized for EvidenceStage.");
            }
            catch (e) {
                const msg = `Failed to initialize ExaSearchClient: ${e.message}`;
                logger.error(msg);
                this.executionLogs.push(msg);
                failures.push("ExaSearch");
            }
        }
        else {
            logger.warn("Exa Search client not initialized for EvidenceStage: Exa Search configuration missing or incomplete (requires api_key and base_url).");
        }
    }
    closeClients() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug("Attempting to close API clients in EvidenceStage.");
            if (this.pubmedClient) {
                try {
                    yield this.pubmedClient.close();
                    logger.debug("PubMed client closed.");
                }
                catch (e) {
                    logger.error(`Error closing PubMed client: ${e.message}`);
                }
            }
            if (this.googleScholarClient) {
                try {
                    yield this.googleScholarClient.close();
                    logger.debug("Google Scholar client closed.");
                }
                catch (e) {
                    logger.error(`Error closing Google Scholar client: ${e.message}`);
                }
            }
            if (this.exaClient) {
                try {
                    yield this.exaClient.close();
                    logger.debug("Exa Search client closed.");
                }
                catch (e) {
                    logger.error(`Error closing Exa Search client: ${e.message}`);
                }
            }
        });
    }
    _deserializeTags(raw) {
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
        }
        catch (e) {
            logger.warn(`Could not deserialize tags payload '${raw}'`);
        }
        return new Set();
    }
    _buildSafeRelationshipQuery(sourceNodeId, targetNodeId, edgeType, properties) {
        (0, cypherValidation_1.validateRelationshipType)(edgeType.valueOf());
        return (0, cypherValidation_1.buildSafeRelationshipQuery)(sourceNodeId, targetNodeId, edgeType, properties);
    }
    _selectHypothesisToEvaluateFromNeo4j(hypothesisNodeIds) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const results = yield this.graphRepo.executeQuery(query, { hypothesis_ids: hypothesisNodeIds }, undefined, "read");
                if (!results || results.length === 0) {
                    return null;
                }
                const eligibleHypothesesData = [];
                for (const record of results) {
                    const hypoData = Object.assign({}, record);
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
                const scoreHypothesisData = (hData) => {
                    const impact = hData.impact_score || 0.1;
                    const confList = hData.confidence_vector_list || [0.5, 0.5, 0.5, 0.5];
                    const confVariance = confList.reduce((sum, c) => sum + Math.pow((c - 0.5), 2), 0) / 4.0;
                    return impact + confVariance;
                };
                eligibleHypothesesData.sort((a, b) => scoreHypothesisData(b) - scoreHypothesisData(a));
                const selectedHypothesisData = eligibleHypothesesData[0];
                logger.debug(`Selected hypothesis '${selectedHypothesisData.label}' (ID: ${selectedHypothesisData.id}) from Neo4j for evidence integration.`);
                return selectedHypothesisData;
            }
            catch (e) {
                logger.error(`Neo4j error selecting hypothesis: ${e.message}`);
                return null;
            }
        });
    }
    _executeHypothesisPlan(hypothesisDataFromNeo4j) {
        return __awaiter(this, void 0, void 0, function* () {
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
                }
                catch (e) {
                    logger.warn(`Could not parse plan_json for hypothesis ${hypoLabel}. Defaulting to label for query.`);
                }
            }
            logger.info(`Executing evidence plan for hypothesis '${hypoLabel}' (ID: ${hypoId}): ${planDetails}`);
            const foundEvidenceList = [];
            const defaultTags = this._deserializeTags(hypothesisDataFromNeo4j.metadata_disciplinary_tags);
            if (defaultTags.size === 0 && this.settings.asr_got.default_parameters) {
                this.settings.asr_got.default_parameters.default_disciplinary_tags.forEach((tag) => defaultTags.add(tag));
            }
            // --- PubMed Search ---
            if (this.pubmedClient) {
                try {
                    yield this._acquireApiSlot();
                    logger.info(`Querying PubMed with: '${searchQuery}' for hypothesis ${hypoId}`);
                    const pubmedArticles = yield this.pubmedClient.searchArticles(searchQuery, 2);
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
                            statistical_power: graphElements_1.StatisticalPowerSchema.parse({
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
                }
                catch (e) {
                    logger.error(`Error querying PubMed for '${searchQuery}': ${e.message}`);
                }
                finally {
                    this._releaseApiSlot();
                }
            }
            // --- Google Scholar Search ---
            if (this.googleScholarClient) {
                try {
                    yield this._acquireApiSlot();
                    logger.info(`Querying Google Scholar with: '${searchQuery}' for hypothesis ${hypoId}`);
                    const gsArticles = yield this.googleScholarClient.search(searchQuery, 2);
                    for (const article of gsArticles) {
                        let content = article.title;
                        if (article.snippet) {
                            content += ` | Snippet: ${article.snippet}`;
                        }
                        let doiCandidate = undefined;
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
                            statistical_power: graphElements_1.StatisticalPowerSchema.parse({
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
                }
                catch (e) {
                    if (e instanceof googleScholarClient_1.UnexpectedResponseStructureError) {
                        logger.warn(`Google Scholar returned unexpected structure for '${searchQuery}': ${e.message}`);
                    }
                    else {
                        logger.error(`Error querying Google Scholar for '${searchQuery}': ${e.message}`);
                    }
                }
                finally {
                    this._releaseApiSlot();
                }
            }
            // --- Exa Search ---
            if (this.exaClient) {
                try {
                    yield this._acquireApiSlot();
                    logger.info(`Querying Exa Search with: '${searchQuery}' for hypothesis ${hypoId}`);
                    const exaResults = yield this.exaClient.search(searchQuery, 2, "neural");
                    for (const result of exaResults) {
                        let content = result.title || "Untitled Exa Result";
                        if (result.highlights) {
                            content += ` | Highlight: ${result.highlights[0]}`;
                        }
                        const authorsListExa = result.author ? [result.author] : [];
                        const supportAnalysis = this._analyzeEvidenceSupport(result.title, result.text || '', hypoLabel);
                        const evidenceItem = {
                            content: content,
                            source_description: "Exa Search Result",
                            url: result.url,
                            doi: undefined,
                            authors_list: authorsListExa,
                            publication_date_str: result.published_date,
                            supports_hypothesis: supportAnalysis.supports,
                            strength: result.score !== undefined ? Math.max(0.1, Math.min(0.9, result.score * supportAnalysis.confidence)) : supportAnalysis.confidence,
                            statistical_power: graphElements_1.StatisticalPowerSchema.parse({
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
                }
                catch (e) {
                    logger.error(`Error querying Exa Search for '${searchQuery}': ${e.message}`);
                }
                finally {
                    this._releaseApiSlot();
                }
            }
            logger.info(`Total evidence pieces found for hypothesis '${hypoLabel}': ${foundEvidenceList.length}`);
            return foundEvidenceList;
        });
    }
    _createEvidenceInNeo4j(hypothesisData, evidenceData, iteration, evidenceIndex) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const hypothesisId = hypothesisData.id;
            const hypothesisLabel = hypothesisData.label || "N/A";
            const hypothesisLayerId = hypothesisData.layer_id || (((_a = this.settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.initial_layer) || "unknown_layer");
            const evidenceId = `ev_${hypothesisId}_${iteration}_${evidenceIndex}_${(0, uuid_1.v4)()}`;
            const edgeType = evidenceData.supports_hypothesis ? graphElements_1.EdgeType.SUPPORTIVE : graphElements_1.EdgeType.CONTRADICTORY;
            const spValue = (evidenceData.statistical_power && typeof evidenceData.statistical_power.value === 'number') ? evidenceData.statistical_power.value : 0.5;
            const evidenceMetadata = {
                description: evidenceData.content || "N/A",
                query_context: '', // Not directly from evidenceData
                source_description: evidenceData.source_description || "N/A",
                epistemic_status: evidenceData.supports_hypothesis ? common_1.EpistemicStatus.EVIDENCE_SUPPORTED : common_1.EpistemicStatus.EVIDENCE_CONTRADICTED,
                disciplinary_tags: (evidenceData.disciplinary_tags || []).join(','),
                layer_id: hypothesisLayerId,
                impact_score: (evidenceData.strength || 0.5) * spValue,
                is_knowledge_gap: false,
                id: (0, uuid_1.v4)(), // Will be overwritten
                doi: evidenceData.doi,
                authors: (evidenceData.authors_list || []).join(','),
                publication_date: evidenceData.publication_date_str,
                revision_history: [],
                plan: undefined, // Not applicable for evidence
                falsification_criteria: undefined, // Not applicable for evidence
                bias_flags: [], // Not applicable for evidence
                created_at: new Date(),
                updated_at: new Date(),
            };
            const evidenceConfidenceVec = common_1.ConfidenceVectorSchema.parse({
                empirical_support: evidenceData.strength || 0.5,
                methodological_rigor: evidenceData.methodological_rigor || (evidenceData.strength || 0.5) * 0.8,
                theoretical_basis: 0.5,
                consensus_alignment: 0.5,
            });
            const evidenceNode = {
                id: evidenceId,
                label: `Evidence ${evidenceIndex + 1} for H: ${hypothesisLabel.substring(0, 20)}...`,
                type: graphElements_1.NodeType.EVIDENCE,
                confidence: evidenceConfidenceVec,
                metadata: evidenceMetadata,
                created_at: evidenceData.timestamp || new Date(),
                updated_at: new Date(),
                updateConfidence: () => { }, // Placeholder
            };
            const evPropsForNeo4j = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(evidenceNode);
            evPropsForNeo4j.metadata_timestamp_iso = (evidenceData.timestamp || new Date()).toISOString();
            evPropsForNeo4j.metadata_raw_source_data_type = evidenceData.raw_source_data_type;
            evPropsForNeo4j.metadata_original_data_dump = JSON.stringify(evidenceData.original_data);
            const createEvNodeQuery = `
      MERGE (e:Node {id: $props.id}) SET e += $props
      WITH e, $type_label AS typeLabel CALL apoc.create.addLabels(e, [typeLabel]) YIELD node
      RETURN node.id AS evidence_id, properties(node) as evidence_props
    `;
            try {
                const resultEvNode = yield this.graphRepo.executeQuery(createEvNodeQuery, { props: evPropsForNeo4j, type_label: graphElements_1.NodeType.EVIDENCE.valueOf() }, undefined, "write");
                if (!resultEvNode || resultEvNode.length === 0 || !resultEvNode[0].evidence_id) {
                    logger.error(`Failed to create evidence node ${evidenceId} in Neo4j.`);
                    return null;
                }
                const createdEvidenceId = resultEvNode[0].evidence_id;
                const createdEvidenceProps = resultEvNode[0].evidence_props;
                const edgeToHypoId = `edge_ev_${createdEvidenceId}_${hypothesisId}_${(0, uuid_1.v4)()}`;
                const edge = {
                    id: edgeToHypoId,
                    source_id: createdEvidenceId,
                    target_id: hypothesisId,
                    type: edgeType,
                    confidence: evidenceData.strength || 0.5,
                    metadata: { description: `Evidence '${evidenceNode.label.substring(0, 20)}...' ${evidenceData.supports_hypothesis ? 'supports' : 'contradicts'} hypothesis.`, weight: 1.0, created_at: new Date(), updated_at: new Date() },
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                const edgePropsForNeo4j = (0, neo4jHelpers_1.prepareEdgePropertiesForNeo4j)(edge);
                const { query: createRelQuery, params: paramsRel } = this._buildSafeRelationshipQuery(createdEvidenceId, hypothesis.id, edgeType, edgePropsForNeo4j);
                const resultRel = yield this.graphRepo.executeQuery(createRelQuery, paramsRel, undefined, "write");
                if (!resultRel || resultRel.length === 0 || !resultRel[0].rel_id) {
                    logger.error(`Failed to link evidence ${createdEvidenceId} to hypothesis ${hypothesisId}.`);
                    return null;
                }
                logger.debug(`Created evidence node ${createdEvidenceId} and linked to hypothesis ${hypothesisId} with type ${edgeType.valueOf()}.`);
                return Object.assign({ id: createdEvidenceId }, createdEvidenceProps);
            }
            catch (e) {
                logger.error(`Neo4j error creating evidence or link: ${e.message}`, e);
                return null;
            }
        });
    }
    _updateHypothesisConfidenceInNeo4j(hypothesisId, priorConfidenceObj, // Should be ConfidenceVector
    evidenceStrength, supportsHypothesis, statisticalPower, // Should be StatisticalPower
    edgeType) {
        return __awaiter(this, void 0, void 0, function* () {
            const priorConfidenceList = priorConfidenceObj.toList();
            const updatedConfidenceList = (0, mathHelpers_1.bayesianUpdateConfidence)(priorConfidenceList, evidenceStrength, supportsHypothesis);
            const updatedConfidence = common_1.ConfidenceVectorSchema.parse({
                empirical_support: updatedConfidenceList[0],
                theoretical_basis: updatedConfidenceList[1],
                methodological_rigor: updatedConfidenceList[2],
                consensus_alignment: updatedConfidenceList[3],
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
                yield this.graphRepo.executeQuery(updateQuery, params, undefined, "write");
                return true;
            }
            catch (e) {
                logger.error(`Neo4j error updating hypothesis confidence ${hypothesisId}: ${e.message}`);
                return false;
            }
        });
    }
    _createIbnInNeo4j(evidenceNodeData, hypothesisNodeData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const hypoTagsRaw = hypothesisNodeData.metadata_disciplinary_tags;
            const evTagsRaw = evidenceNodeData.metadata_disciplinary_tags;
            const hypoTags = this._deserializeTags(hypoTagsRaw);
            const evTags = this._deserializeTags(evTagsRaw);
            if (!hypoTags.size || !evTags.size || !Array.from(hypoTags).some(tag => evTags.has(tag))) { // Check if NO intersection exists
                return null;
            }
            const hypoLabelForSim = hypothesisNodeData.label || "";
            const evLabelForSim = evidenceNodeData.label || "";
            const similarity = (0, metadataHelpers_1.calculateSemanticSimilarity)(hypoLabelForSim, evLabelForSim);
            if (similarity < this.ibnSimilarityThreshold) {
                return null;
            }
            const ibnId = `ibn_${evidenceNodeData.id}_${hypothesisNodeData.id}_${(0, uuid_1.v4)()}`;
            const ibnLabel = `IBN: ${evLabelForSim.substring(0, 20)}... <=> ${hypoLabelForSim.substring(0, 20)}...`;
            const combinedTags = new Set([...hypoTags, ...evTags]);
            const ibnMetadata = {
                description: `Interdisciplinary bridge between domains ${Array.from(hypoTags).join(', ')} and ${Array.from(evTags).join(', ')}.`,
                query_context: '',
                source_description: "EvidenceStage IBN Creation (P1.8)",
                epistemic_status: common_1.EpistemicStatus.INFERRED,
                disciplinary_tags: Array.from(combinedTags).join(','),
                layer_id: evidenceNodeData.metadata_layer_id || (((_a = this.settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.initial_layer) || "unknown_layer"),
                impact_score: 0.6,
                is_knowledge_gap: false,
                id: (0, uuid_1.v4)(), // Will be overwritten
                doi: undefined,
                authors: '',
                publication_date: '',
                revision_history: [],
                plan: undefined,
                falsification_criteria: undefined,
                bias_flags: [],
                created_at: new Date(),
                updated_at: new Date(),
            };
            const ibnNode = {
                id: ibnId,
                label: ibnLabel,
                type: graphElements_1.NodeType.INTERDISCIPLINARY_BRIDGE,
                confidence: common_1.ConfidenceVectorSchema.parse({
                    empirical_support: similarity,
                    theoretical_basis: 0.4,
                    methodological_rigor: 0.5,
                    consensus_alignment: 0.3,
                }),
                metadata: ibnMetadata,
                created_at: new Date(),
                updated_at: new Date(),
                updateConfidence: () => { }, // Placeholder
            };
            const ibnProps = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(ibnNode);
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
                const resultIbn = yield this.graphRepo.executeQuery(createIbnQuery, { props: ibnProps, type_label: graphElements_1.NodeType.INTERDISCIPLINARY_BRIDGE.valueOf() }, undefined, "write");
                if (!resultIbn || resultIbn.length === 0 || !resultIbn[0].ibn_created_id) {
                    logger.error(`Failed to create IBN node ${ibnId} in Neo4j.`);
                    return null;
                }
                const createdIbnId = resultIbn[0].ibn_created_id;
                const edge1Id = `edge_${evidenceNodeData.id}_${graphElements_1.EdgeType.IBN_SOURCE_LINK.valueOf()}_${createdIbnId}_${(0, uuid_1.v4)()}`;
                const edge1 = {
                    id: edge1Id,
                    source_id: evidenceNodeData.id,
                    target_id: createdIbnId,
                    type: graphElements_1.EdgeType.IBN_SOURCE_LINK,
                    confidence: 0.8,
                    metadata: { description: '', weight: 1.0, created_at: new Date(), updated_at: new Date() },
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                const edge1Props = (0, neo4jHelpers_1.prepareEdgePropertiesForNeo4j)(edge1);
                const edge2Id = `edge_${createdIbnId}_${graphElements_1.EdgeType.IBN_TARGET_LINK.valueOf()}_${hypothesisNodeData.id}_${(0, uuid_1.v4)()}`;
                const edge2 = {
                    id: edge2Id,
                    source_id: createdIbnId,
                    target_id: hypothesisNodeData.id,
                    type: graphElements_1.EdgeType.IBN_TARGET_LINK,
                    confidence: 0.8,
                    metadata: { description: '', weight: 1.0, created_at: new Date(), updated_at: new Date() },
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                const edge2Props = (0, neo4jHelpers_1.prepareEdgePropertiesForNeo4j)(edge2);
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
                const linkResults = yield this.graphRepo.executeQuery(linkIbnQuery, paramsLink, undefined, "write");
                if (!linkResults || linkResults.length === 0 || !linkResults[0].r1_id || !linkResults[0].r2_id) {
                    logger.error(`Failed to link IBN ${createdIbnId} to evidence/hypothesis.`);
                    return null;
                }
                logger.info(`Created IBN ${createdIbnId} and linked it between ${evidenceNodeData.id} and ${hypothesisNodeData.id}.`);
                return createdIbnId;
            }
            catch (e) {
                logger.error(`Neo4j error during IBN creation or linking for ${ibnId}: ${e.message}`, e);
                return null;
            }
        });
    }
    _createHyperedgesInNeo4j(hypothesisData, relatedEvidenceDataList) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const createdHyperedgeIds = [];
            const minNodesForHyperedge = this.minNodesForHyperedgeConsideration;
            if (relatedEvidenceDataList.length < minNodesForHyperedge) {
                return createdHyperedgeIds;
            }
            const hyperedgeCenterId = `hyper_${hypothesisData.id}_${(0, uuid_1.v4)()}`;
            const hyperedgeNodeIdsForPydantic = new Set([hypothesisData.id]);
            relatedEvidenceDataList.forEach(evData => hyperedgeNodeIdsForPydantic.add(evData.id));
            const hypoConfEmp = hypothesisData.conf_empirical || 0.5;
            const avgEmpSupport = (hypoConfEmp +
                relatedEvidenceDataList.reduce((sum, ev) => sum + (ev.confidence_empirical_support || 0.5), 0)) / (1 + relatedEvidenceDataList.length);
            const hyperConfidence = common_1.ConfidenceVectorSchema.parse({
                empirical_support: avgEmpSupport,
                theoretical_basis: 0.4,
                methodological_rigor: 0.5,
                consensus_alignment: 0.4,
            });
            const hyperedgeNodeMetadata = {
                description: `Joint influence on hypothesis ${(_a = hypothesisData.label) === null || _a === void 0 ? void 0 : _a.substring(0, 20)}...`,
                query_context: '',
                source_description: '',
                epistemic_status: common_1.EpistemicStatus.INFERRED,
                disciplinary_tags: '',
                layer_id: hypothesisData.layer_id || (((_b = this.settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.initial_layer) || "unknown_layer"),
                impact_score: 0.0,
                is_knowledge_gap: false,
                id: (0, uuid_1.v4)(), // Will be overwritten
                doi: undefined,
                authors: '',
                publication_date: '',
                revision_history: [],
                plan: undefined,
                falsification_criteria: undefined,
                bias_flags: [],
                created_at: new Date(),
                updated_at: new Date(),
            };
            // Add misc_properties equivalent
            hyperedgeNodeMetadata.misc_properties = { relationship_descriptor: "Joint Support/Contradiction (Simulated)" };
            const hyperedgeCenterNode = {
                id: hyperedgeCenterId,
                label: `Hyperedge for ${(_c = hypothesisData.label) === null || _c === void 0 ? void 0 : _c.substring(0, 20)}`,
                type: graphElements_1.NodeType.HYPEREDGE_CENTER,
                confidence: hyperConfidence,
                metadata: hyperedgeNodeMetadata,
                created_at: new Date(),
                updated_at: new Date(),
                updateConfidence: () => { }, // Placeholder
            };
            const centerNodeProps = (0, neo4jHelpers_1.prepareNodePropertiesForNeo4j)(hyperedgeCenterNode);
            try {
                const createCenterQuery = `
        MERGE (hc:Node {id: $props.id}) SET hc += $props
        WITH hc, $type_label AS typeLabel CALL apoc.create.addLabels(hc, [typeLabel]) YIELD node
        RETURN node.id AS hyperedge_center_created_id
      `;
                const resultCenter = yield this.graphRepo.executeQuery(createCenterQuery, { props: centerNodeProps, type_label: graphElements_1.NodeType.HYPEREDGE_CENTER.valueOf() }, undefined, "write");
                if (!resultCenter || resultCenter.length === 0 || !resultCenter[0].hyperedge_center_created_id) {
                    logger.error(`Failed to create hyperedge center node ${hyperedgeCenterId}.`);
                    return createdHyperedgeIds;
                }
                const createdHyperedgeCenterId = resultCenter[0].hyperedge_center_created_id;
                const batchMemberLinksData = [];
                for (const memberId of Array.from(hyperedgeNodeIdsForPydantic)) {
                    const edgeId = `edge_hyper_${createdHyperedgeCenterId}_hasmember_${memberId}_${(0, uuid_1.v4)()}`;
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
                    const linkResults = yield this.graphRepo.executeQuery(linkMembersQuery, { links: batchMemberLinksData }, undefined, "write");
                    if (linkResults && linkResults.length > 0 && linkResults[0].total_links_created !== undefined) {
                        logger.debug(`Batch created ${linkResults[0].total_links_created} HAS_MEMBER links for hyperedge ${createdHyperedgeCenterId}.`);
                    }
                    else {
                        logger.error(`Failed to get count from batch hyperedge member linking for ${createdHyperedgeCenterId}.`);
                    }
                }
                createdHyperedgeIds.push(createdHyperedgeCenterId);
                logger.info(`Created Hyperedge (center node ${createdHyperedgeCenterId}) for hypothesis ${hypothesisData.id} and ${relatedEvidenceDataList.length} evidence nodes.`);
            }
            catch (e) {
                logger.error(`Neo4j error creating hyperedge or linking members for hypothesis ${hypothesisData.id}: ${e.message}`, e);
            }
            return createdHyperedgeIds;
        });
    }
    _applyTemporalDecayAndPatterns() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug("Temporal decay and pattern detection - placeholder.");
            // This would involve fetching nodes, calculating decay, and persisting updates.
            // For now, it's a no-op.
        });
    }
    _adaptGraphTopology() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug("Dynamic graph topology adaptation - placeholder.");
            // This would involve creating hyperedges, removing redundant edges, and simplifying the graph.
            // For now, it's a no-op.
        });
    }
    _acquireApiSlot() {
        return __awaiter(this, void 0, void 0, function* () {
            while (this.apiCallSemaphore.current >= this.apiCallSemaphore.max) {
                yield new Promise(resolve => setTimeout(resolve, 100));
            }
            this.apiCallSemaphore.current++;
        });
    }
    _releaseApiSlot() {
        this.apiCallSemaphore.current = Math.max(0, this.apiCallSemaphore.current - 1);
    }
    _analyzeEvidenceSupport(evidenceTitle, evidenceAbstract, hypothesisLabel) {
        // Simple heuristic-based analysis to determine if evidence supports hypothesis
        const evidence = `${evidenceTitle} ${evidenceAbstract}`.toLowerCase();
        const hypothesis = hypothesisLabel.toLowerCase();
        // Look for contradictory terms
        const contradictoryTerms = ['not', 'no', 'fail', 'contrary', 'against', 'oppose', 'refute', 'disprove', 'invalid'];
        const supportiveTerms = ['support', 'confirm', 'validate', 'prove', 'demonstrate', 'show', 'evidence', 'consistent'];
        let supportScore = 0;
        let contradictScore = 0;
        // Check for contradictory patterns
        for (const term of contradictoryTerms) {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            const matches = evidence.match(regex);
            if (matches) {
                contradictScore += matches.length;
            }
        }
        // Check for supportive patterns
        for (const term of supportiveTerms) {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            const matches = evidence.match(regex);
            if (matches) {
                supportScore += matches.length;
            }
        }
        // Check semantic similarity (basic keyword overlap)
        const hypothesisWords = hypothesis.split(/\s+/).filter(word => word.length > 3);
        const evidenceWords = evidence.split(/\s+/).filter(word => word.length > 3);
        const overlap = hypothesisWords.filter(word => evidenceWords.includes(word)).length;
        const semanticScore = overlap / Math.max(hypothesisWords.length, 1);
        // Determine support with confidence
        const netSupport = supportScore - contradictScore + semanticScore;
        const supports = netSupport > 0;
        const confidence = Math.min(0.9, Math.max(0.1, Math.abs(netSupport) / 3));
        return { supports, confidence };
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logStart(currentSessionData.session_id);
            const hypothesisData = currentSessionData.accumulated_context[hypothesisStage_1.HypothesisStage.STAGE_NAME] || {};
            const hypothesisNodeIds = hypothesisData.hypothesis_node_ids || [];
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
                    return new baseStage_1.StageOutput(false, summary, { [this.stageName]: contextUpdate }, "No hypotheses", metrics);
                }
                const processedHypothesesThisRun = new Set();
                for (let iterationNum = 0; iterationNum < this.maxIterations; iterationNum++) {
                    iterationsRun = iterationNum + 1;
                    logger.info(`Evidence integration iteration ${iterationsRun}/${this.maxIterations}`);
                    const eligibleIdsForSelection = hypothesisNodeIds.filter((hid) => !processedHypothesesThisRun.has(hid));
                    if (eligibleIdsForSelection.length === 0) {
                        logger.info("All hypotheses processed or no eligible ones left for this run.");
                        break;
                    }
                    const selectedHypothesisData = yield this._selectHypothesisToEvaluateFromNeo4j(eligibleIdsForSelection);
                    if (!selectedHypothesisData) {
                        logger.info("No more eligible hypotheses to evaluate in this iteration loop.");
                        break;
                    }
                    const currentHypothesisId = selectedHypothesisData.id;
                    processedHypothesesThisRun.add(currentHypothesisId);
                    const foundEvidenceConceptualList = yield this._executeHypothesisPlan(selectedHypothesisData);
                    if (foundEvidenceConceptualList.length === 0) {
                        logger.debug(`No new evidence found/generated for hypothesis '${selectedHypothesisData.label || currentHypothesisId}'.`);
                        continue;
                    }
                    const relatedEvidenceDataForHyperedge = [];
                    for (let evIdx = 0; evIdx < foundEvidenceConceptualList.length; evIdx++) {
                        const evConceptualData = foundEvidenceConceptualList[evIdx];
                        const createdEvidenceNeo4jData = yield this._createEvidenceInNeo4j(selectedHypothesisData, evConceptualData, iterationNum, evIdx);
                        if (!createdEvidenceNeo4jData) {
                            logger.warn(`Failed to create Neo4j data for one piece of evidence for hypothesis ${currentHypothesisId}.`);
                            continue;
                        }
                        evidenceCreatedCount++;
                        relatedEvidenceDataForHyperedge.push(createdEvidenceNeo4jData);
                        const priorConfidenceList = selectedHypothesisData.confidence_vector_list || [0.5, 0.5, 0.5, 0.5];
                        const priorHypoConfidenceObj = common_1.ConfidenceVectorSchema.parse({
                            empirical_support: priorConfidenceList[0],
                            theoretical_basis: priorConfidenceList[1],
                            methodological_rigor: priorConfidenceList[2],
                            consensus_alignment: priorConfidenceList[3],
                        });
                        const edgeTypeForUpdate = evConceptualData.supports_hypothesis ? graphElements_1.EdgeType.SUPPORTIVE : graphElements_1.EdgeType.CONTRADICTORY;
                        const updateSuccessful = yield this._updateHypothesisConfidenceInNeo4j(currentHypothesisId, priorHypoConfidenceObj, evConceptualData.strength || 0.5, evConceptualData.supports_hypothesis, evConceptualData.statistical_power, edgeTypeForUpdate);
                        if (updateSuccessful) {
                            hypothesesUpdatedCount++;
                        }
                        const ibnCreatedId = yield this._createIbnInNeo4j(createdEvidenceNeo4jData, selectedHypothesisData);
                        if (ibnCreatedId) {
                            ibnsCreatedCount++;
                        }
                    }
                    if (relatedEvidenceDataForHyperedge.length > 0) {
                        const hyperedgeIds = yield this._createHyperedgesInNeo4j(selectedHypothesisData, relatedEvidenceDataForHyperedge);
                        hyperedgesCreatedCount += hyperedgeIds.length;
                    }
                }
                yield this._applyTemporalDecayAndPatterns();
                yield this._adaptGraphTopology();
            }
            finally {
                yield this.closeClients();
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
            const output = new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.EvidenceStage = EvidenceStage;
EvidenceStage.STAGE_NAME = "EvidenceStage";
