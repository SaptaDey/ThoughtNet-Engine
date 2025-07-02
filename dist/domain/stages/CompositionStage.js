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
exports.CompositionStage = exports.ComposedOutputSchema = exports.OutputSectionSchema = exports.CitationItemSchema = void 0;
const zod_1 = require("zod");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const baseStage_1 = require("./baseStage");
const subgraphExtractionStage_1 = require("./subgraphExtractionStage");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
exports.CitationItemSchema = zod_1.z.object({
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    text: zod_1.z.string(),
    source_node_id: zod_1.z.string().optional(),
    url: zod_1.z.string().optional(),
});
exports.OutputSectionSchema = zod_1.z.object({
    title: zod_1.z.string(),
    content: zod_1.z.string(),
    type: zod_1.z.string().default('generic'),
    referenced_subgraph_name: zod_1.z.string().optional(),
    related_node_ids: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.ComposedOutputSchema = zod_1.z.object({
    title: zod_1.z.string(),
    executive_summary: zod_1.z.string(),
    sections: zod_1.z.array(exports.OutputSectionSchema).default([]),
    citations: zod_1.z.array(exports.CitationItemSchema).default([]),
    reasoning_trace_appendix_summary: zod_1.z.string().optional(),
    graph_topology_summary: zod_1.z.string().optional(),
});
// Local version of ExtractedSubgraphData to match the input structure
const LocalExtractedSubgraphDataSchema = subgraphExtractionStage_1.ExtractedSubgraphDataSchema;
class CompositionStage extends baseStage_1.BaseStage {
    constructor(settings) {
        super(settings);
        this.stageName = CompositionStage.STAGE_NAME;
        this.citationStyle = "Vancouver";
    }
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    _generateExecutiveSummary(extractedSubgraphsData, initialQuery) {
        return __awaiter(this, void 0, void 0, function* () {
            const numSubgraphs = extractedSubgraphsData.length;
            const subgraphNames = extractedSubgraphsData.map(sg => sg.name);
            const sampleNames = subgraphNames.length > 0 ? subgraphNames.sort(() => 0.5 - Math.random()).slice(0, Math.min(2, numSubgraphs)) : ['key findings'];
            const summary = (`Executive summary for the analysis of query: '${initialQuery}'.\n` +
                `The ASR-GoT process identified ${numSubgraphs} key subgraphs of interest: ${subgraphNames.join(', ')}. ` +
                `These subgraphs highlight various facets of the research topic, including ` +
                `${sampleNames.join(', ')}. ` +
                `Further details are provided in the subsequent sections.`);
            logger.debug("Generated placeholder executive summary.");
            return summary;
        });
    }
    _formatNodeDictAsClaim(nodeDict) {
        return __awaiter(this, void 0, void 0, function* () {
            const nodeId = nodeDict.id || "UnknownID";
            const properties = nodeDict.properties || {};
            const nodeLabel = properties.label || "Unknown Label";
            let nodeTypeStr = properties.type;
            if (!nodeTypeStr && nodeDict.labels) {
                const specificLabels = nodeDict.labels.filter((label) => label !== "Node");
                nodeTypeStr = specificLabels.length > 0 ? specificLabels[0] : "UnknownType";
            }
            const nodeTypeVal = nodeTypeStr || "UnknownType";
            let claimText = `Claim based on Node ${nodeId} ('${nodeLabel}', Type: ${nodeTypeVal}): `;
            const description = properties.metadata_description || "";
            if (description) {
                claimText += description.substring(0, 100) + "...";
            }
            const createdAtIso = properties.metadata_created_at_iso || properties.created_at_iso;
            let createdAtStr = "Unknown Date";
            if (createdAtIso) {
                try {
                    const createdAtDt = new Date(createdAtIso);
                    createdAtStr = createdAtDt.toISOString().split('T')[0]; // YYYY-MM-DD
                }
                catch (error) {
                    logger.warn(`Could not parse date: ${createdAtIso} for node ${nodeId}`);
                }
            }
            const citationText = `Adaptive Graph of Thoughts Internal Node. ID: ${nodeId}. Label: ${nodeLabel}. Type: ${nodeTypeVal}. Created: ${createdAtStr}.`;
            const citation = exports.CitationItemSchema.parse({
                id: `Node-${nodeId}`,
                text: citationText,
                source_node_id: nodeId,
            });
            return [`${claimText} [${citation.id}]`, citation];
        });
    }
    _generateSectionFromSubgraphData(subgraphData) {
        return __awaiter(this, void 0, void 0, function* () {
            const sectionTitle = `Analysis: ${subgraphData.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;
            const contentParts = [
                `This section discusses findings from the '${subgraphData.name}' subgraph, which focuses on: ${subgraphData.description}.\n`,
            ];
            const citations = [];
            const relatedNodeIdsForSection = subgraphData.nodes.map(n => n.id).filter(id => id);
            const keyNodesInSubgraph = [];
            for (const nodeDict of subgraphData.nodes) {
                const props = nodeDict.properties || {};
                const nodeTypeStr = props.type;
                let nodeTypeEnum = null;
                if (nodeTypeStr && Object.values(graphElements_1.NodeType).includes(nodeTypeStr)) {
                    nodeTypeEnum = nodeTypeStr;
                }
                let avgConfidence = props.confidence_overall_avg || 0.0;
                if (avgConfidence === 0.0) {
                    const confComponents = [
                        props.confidence_empirical_support || 0.0,
                        props.confidence_theoretical_basis || 0.0,
                        props.confidence_methodological_rigor || 0.0,
                        props.confidence_consensus_alignment || 0.0,
                    ];
                    const validComponents = confComponents.filter(c => typeof c === 'number');
                    avgConfidence = validComponents.length > 0 ? validComponents.reduce((sum, c) => sum + c, 0) / validComponents.length : 0.0;
                }
                const impactScore = props.metadata_impact_score || 0.0;
                if (nodeTypeEnum && [
                    graphElements_1.NodeType.HYPOTHESIS,
                    graphElements_1.NodeType.EVIDENCE,
                    graphElements_1.NodeType.INTERDISCIPLINARY_BRIDGE,
                ].includes(nodeTypeEnum) && (avgConfidence > 0.6 || impactScore > 0.6)) {
                    nodeDict.calculated_avg_confidence = avgConfidence;
                    keyNodesInSubgraph.push(nodeDict);
                }
            }
            keyNodesInSubgraph.sort((a, b) => {
                var _a, _b;
                const impactA = ((_a = a.properties) === null || _a === void 0 ? void 0 : _a.metadata_impact_score) || 0.0;
                const impactB = ((_b = b.properties) === null || _b === void 0 ? void 0 : _b.metadata_impact_score) || 0.0;
                const confA = a.calculated_avg_confidence || 0.0;
                const confB = b.calculated_avg_confidence || 0.0;
                if (impactA !== impactB)
                    return impactB - impactA;
                return confB - confA;
            });
            for (let i = 0; i < Math.min(keyNodesInSubgraph.length, 3); i++) {
                const nodeD = keyNodesInSubgraph[i];
                const [claimText, citation] = yield this._formatNodeDictAsClaim(nodeD);
                contentParts.push(`Key Point ${i + 1}: ${claimText}`);
                if (citation) {
                    citations.push(citation);
                }
                const nodeId = nodeD.id;
                if (nodeId && subgraphData.relationships) {
                    const incomingRelsDesc = [];
                    const outgoingRelsDesc = [];
                    for (const relDict of subgraphData.relationships) {
                        const relType = relDict.type || "RELATED";
                        if (relDict.target === nodeId) {
                            incomingRelsDesc.push(`${relType} from ${relDict.start}`);
                        }
                        if (relDict.start === nodeId) {
                            outgoingRelsDesc.push(`${relType} to ${relDict.end}`);
                        }
                    }
                    if (incomingRelsDesc.length > 0) {
                        contentParts.push(`  - Connected from: ${incomingRelsDesc.slice(0, 2).join(', ')}`);
                    }
                    if (outgoingRelsDesc.length > 0) {
                        contentParts.push(`  - Connects to: ${outgoingRelsDesc.slice(0, 2).join(', ')}`);
                    }
                }
            }
            if (keyNodesInSubgraph.length === 0) {
                contentParts.push("No specific high-impact claims identified in this subgraph based on current criteria.");
            }
            ;
            const section = exports.OutputSectionSchema.parse({
                title: sectionTitle,
                content: contentParts.join('\n'),
                type: "analysis_subgraph",
                referenced_subgraph_name: subgraphData.name,
                related_node_ids: relatedNodeIdsForSection,
            });
            logger.debug(`Generated content for section: '${sectionTitle}'.`);
            return [section, citations];
        });
    }
    _generateReasoningTraceAppendixSummary(sessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = ["Summary of Reasoning Trace Appendix:"];
            for (const traceItem of sessionData.stage_outputs_trace) {
                lines.push(`  Stage ${traceItem.stage_number}. ${traceItem.stage_name}: ${traceItem.summary} (${traceItem.duration_ms || 'N/A'}ms)`);
            }
            return lines.join('\n');
        });
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this._logStart(currentSessionData.session_id);
            const subgraphExtractionResultsDict = currentSessionData.accumulated_context[subgraphExtractionStage_1.SubgraphExtractionStage.STAGE_NAME] || {};
            const extractedSubgraphsRawData = ((_a = subgraphExtractionResultsDict.subgraph_extraction_results) === null || _a === void 0 ? void 0 : _a.subgraphs) || [];
            const parsedSubgraphs = [];
            if (extractedSubgraphsRawData.length > 0) {
                try {
                    for (const dataDict of extractedSubgraphsRawData) {
                        parsedSubgraphs.push(LocalExtractedSubgraphDataSchema.parse(dataDict));
                    }
                }
                catch (error) {
                    logger.error(`Error parsing extracted subgraph definitions: ${error.message}`);
                }
            }
            const initialQuery = currentSessionData.query;
            if (parsedSubgraphs.length === 0) {
                logger.warn("No subgraphs parsed successfully. Composition will be minimal.");
                const composedOutputObj = exports.ComposedOutputSchema.parse({
                    title: `Adaptive Graph of Thoughts Analysis (Minimal): ${initialQuery.substring(0, 50)}...`,
                    executive_summary: "No specific subgraphs were extracted or parsed for detailed composition.",
                    reasoning_trace_appendix_summary: yield this._generateReasoningTraceAppendixSummary(currentSessionData),
                });
                return new baseStage_1.StageOutput(true, "Composition complete (minimal due to no/invalid subgraphs).", { [this.stageName]: { final_composed_output: composedOutputObj } }, undefined, {
                    sections_generated: 0,
                    citations_generated: 0,
                });
            }
            const allCitations = [];
            const outputSections = [];
            const execSummary = yield this._generateExecutiveSummary(parsedSubgraphs, initialQuery);
            for (const subgraphDataObj of parsedSubgraphs) {
                try {
                    const [section, sectionCitations] = yield this._generateSectionFromSubgraphData(subgraphDataObj);
                    outputSections.push(section);
                    allCitations.push(...sectionCitations);
                }
                catch (error) {
                    logger.error(`Error generating section for subgraph '${subgraphDataObj.name}': ${error.message}`);
                }
            }
            const finalCitationsMap = {};
            for (const cit of allCitations) {
                const key = String(cit.id);
                if (!(key in finalCitationsMap)) {
                    finalCitationsMap[key] = cit;
                }
            }
            const finalCitations = Object.values(finalCitationsMap);
            const traceAppendixSummary = yield this._generateReasoningTraceAppendixSummary(currentSessionData);
            const composedOutputObj = exports.ComposedOutputSchema.parse({
                title: `Adaptive Graph of Thoughts Analysis: ${initialQuery.substring(0, 50)}...`,
                executive_summary: execSummary,
                sections: outputSections,
                citations: finalCitations,
                reasoning_trace_appendix_summary: traceAppendixSummary,
            });
            const summary = `Composed final output with ${outputSections.length} sections and ${finalCitations.length} citations.`;
            const metrics = {
                sections_generated: outputSections.length,
                citations_generated: finalCitations.length,
                subgraphs_processed: parsedSubgraphs.length,
            };
            const contextUpdate = { final_composed_output: composedOutputObj };
            const output = new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.CompositionStage = CompositionStage;
CompositionStage.STAGE_NAME = "CompositionStage";
