import { z } from 'zod';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { NodeType } from '../models/graphElements';
import { BaseStage, StageOutput } from './baseStage';
import { SubgraphExtractionStage, ExtractedSubgraphDataSchema } from './subgraphExtractionStage';

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

export const CitationItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  text: z.string(),
  source_node_id: z.string().optional(),
  url: z.string().optional(),
});

export type CitationItem = z.infer<typeof CitationItemSchema>;

export const OutputSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string().default('generic'),
  referenced_subgraph_name: z.string().optional(),
  related_node_ids: z.array(z.string()).default([]),
});

export type OutputSection = z.infer<typeof OutputSectionSchema>;

export const ComposedOutputSchema = z.object({
  title: z.string(),
  executive_summary: z.string(),
  sections: z.array(OutputSectionSchema).default([]),
  citations: z.array(CitationItemSchema).default([]),
  reasoning_trace_appendix_summary: z.string().optional(),
  graph_topology_summary: z.string().optional(),
});

export type ComposedOutput = z.infer<typeof ComposedOutputSchema>;

// Local version of ExtractedSubgraphData to match the input structure
const LocalExtractedSubgraphDataSchema = ExtractedSubgraphDataSchema;
type LocalExtractedSubgraphData = z.infer<typeof LocalExtractedSubgraphDataSchema>;

export class CompositionStage extends BaseStage {
  static STAGE_NAME: string = "CompositionStage";
  stageName: string = CompositionStage.STAGE_NAME;
  private citationStyle: string = "Vancouver";

  constructor(settings: any) {
    super(settings);
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private async _generateExecutiveSummary(
    extractedSubgraphsData: LocalExtractedSubgraphData[],
    initialQuery: string,
  ): Promise<string> {
    const numSubgraphs = extractedSubgraphsData.length;
    const subgraphNames = extractedSubgraphsData.map(sg => sg.name);
    const sampleNames = subgraphNames.length > 0 ? subgraphNames.sort(() => 0.5 - Math.random()).slice(0, Math.min(2, numSubgraphs)) : ['key findings'];

    const summary = (
      `Executive summary for the analysis of query: '${initialQuery}'.\n` +
      `The ASR-GoT process identified ${numSubgraphs} key subgraphs of interest: ${subgraphNames.join(', ')}. ` +
      `These subgraphs highlight various facets of the research topic, including ` +
      `${sampleNames.join(', ')}. ` +
      `Further details are provided in the subsequent sections.`
    );
    logger.debug("Generated placeholder executive summary.");
    return summary;
  }

  private async _formatNodeDictAsClaim(
    nodeDict: Record<string, any>,
  ): Promise<[string, CitationItem | null]> {
    const nodeId = nodeDict.id || "UnknownID";
    const properties = nodeDict.properties || {};
    const nodeLabel = properties.label || "Unknown Label";
    let nodeTypeStr = properties.type;

    if (!nodeTypeStr && nodeDict.labels) {
      const specificLabels = nodeDict.labels.filter((label: string) => label !== "Node");
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
      } catch (error) {
        logger.warn(`Could not parse date: ${createdAtIso} for node ${nodeId}`);
      }
    }

    const citationText = `Adaptive Graph of Thoughts Internal Node. ID: ${nodeId}. Label: ${nodeLabel}. Type: ${nodeTypeVal}. Created: ${createdAtStr}.`;
    const citation = CitationItemSchema.parse({
      id: `Node-${nodeId}`,
      text: citationText,
      source_node_id: nodeId,
    });
    return [`${claimText} [${citation.id}]`, citation];
  }

  private async _generateSectionFromSubgraphData(
    subgraphData: LocalExtractedSubgraphData,
  ): Promise<[OutputSection, CitationItem[]]> {
    const sectionTitle = `Analysis: ${subgraphData.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;
    const contentParts: string[] = [
      `This section discusses findings from the '${subgraphData.name}' subgraph, which focuses on: ${subgraphData.description}.\n`,
    ];
    const citations: CitationItem[] = [];
    const relatedNodeIdsForSection: string[] = subgraphData.nodes.map(n => n.id).filter(id => id);

    const keyNodesInSubgraph: Record<string, any>[] = [];
    for (const nodeDict of subgraphData.nodes) {
      const props = nodeDict.properties || {};
      const nodeTypeStr = props.type;
      let nodeTypeEnum: NodeType | null = null;
      if (nodeTypeStr && Object.values(NodeType).includes(nodeTypeStr as NodeType)) {
        nodeTypeEnum = nodeTypeStr as NodeType;
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
        NodeType.HYPOTHESIS,
        NodeType.EVIDENCE,
        NodeType.INTERDISCIPLINARY_BRIDGE,
      ].includes(nodeTypeEnum) && (avgConfidence > 0.6 || impactScore > 0.6)) {
        nodeDict.calculated_avg_confidence = avgConfidence;
        keyNodesInSubgraph.push(nodeDict);
      }
    }

    keyNodesInSubgraph.sort(
      (a, b) => {
        const impactA = a.properties?.metadata_impact_score || 0.0;
        const impactB = b.properties?.metadata_impact_score || 0.0;
        const confA = a.calculated_avg_confidence || 0.0;
        const confB = b.calculated_avg_confidence || 0.0;
        if (impactA !== impactB) return impactB - impactA;
        return confB - confA;
      }
    );

    for (let i = 0; i < Math.min(keyNodesInSubgraph.length, 3); i++) {
      const nodeD = keyNodesInSubgraph[i];
      const [claimText, citation] = await this._formatNodeDictAsClaim(nodeD);
      contentParts.push(`Key Point ${i + 1}: ${claimText}`);
      if (citation) {
        citations.push(citation);
      }

      const nodeId = nodeD.id;
      if (nodeId && subgraphData.relationships) {
        const incomingRelsDesc: string[] = [];
        const outgoingRelsDesc: string[] = [];
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
    };

    const section = OutputSectionSchema.parse({
      title: sectionTitle,
      content: contentParts.join('\n'),
      type: "analysis_subgraph",
      referenced_subgraph_name: subgraphData.name,
      related_node_ids: relatedNodeIdsForSection,
    });
    logger.debug(`Generated content for section: '${sectionTitle}'.`);
    return [section, citations];
  }

  private async _generateReasoningTraceAppendixSummary(
    sessionData: GoTProcessorSessionData
  ): Promise<string> {
    const lines = ["Summary of Reasoning Trace Appendix:"];
    for (const traceItem of sessionData.stage_outputs_trace) {
      lines.push(
        `  Stage ${traceItem.stage_number}. ${traceItem.stage_name}: ${traceItem.summary} (${traceItem.duration_ms || 'N/A'}ms)`
      );
    }
    return lines.join('\n');
  }

  async execute(
    currentSessionData: GoTProcessorSessionData
  ): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);

    const subgraphExtractionResultsDict = currentSessionData.accumulated_context[SubgraphExtractionStage.STAGE_NAME] || {};
    const extractedSubgraphsRawData: any[] = subgraphExtractionResultsDict.subgraph_extraction_results?.subgraphs || [];

    const parsedSubgraphs: LocalExtractedSubgraphData[] = [];
    if (extractedSubgraphsRawData.length > 0) {
      try {
        for (const dataDict of extractedSubgraphsRawData) {
          parsedSubgraphs.push(LocalExtractedSubgraphDataSchema.parse(dataDict));
        }
      } catch (error: any) {
        logger.error(`Error parsing extracted subgraph definitions: ${error.message}`);
      }
    }

    const initialQuery = currentSessionData.query;

    if (parsedSubgraphs.length === 0) {
      logger.warn("No subgraphs parsed successfully. Composition will be minimal.");
      const composedOutputObj = ComposedOutputSchema.parse({
        title: `Adaptive Graph of Thoughts Analysis (Minimal): ${initialQuery.substring(0, 50)}...`,
        executive_summary: "No specific subgraphs were extracted or parsed for detailed composition.",
        reasoning_trace_appendix_summary: await this._generateReasoningTraceAppendixSummary(
          currentSessionData
        ),
      });
      return new StageOutput(
        true,
        "Composition complete (minimal due to no/invalid subgraphs).",
        { [this.stageName]: { final_composed_output: composedOutputObj } },
        undefined,
        {
          sections_generated: 0,
          citations_generated: 0,
        }
      );
    }

    const allCitations: CitationItem[] = [];
    const outputSections: OutputSection[] = [];

    const execSummary = await this._generateExecutiveSummary(
      parsedSubgraphs, initialQuery
    );

    for (const subgraphDataObj of parsedSubgraphs) {
      try {
        const [section, sectionCitations] = await this._generateSectionFromSubgraphData(subgraphDataObj);
        outputSections.push(section);
        allCitations.push(...sectionCitations);
      } catch (error: any) {
        logger.error(`Error generating section for subgraph '${subgraphDataObj.name}': ${error.message}`);
      }
    }

    const finalCitationsMap: { [key: string]: CitationItem } = {};
    for (const cit of allCitations) {
      const key = String(cit.id);
      if (!(key in finalCitationsMap)) {
        finalCitationsMap[key] = cit;
      }
    }
    const finalCitations = Object.values(finalCitationsMap);

    const traceAppendixSummary = await this._generateReasoningTraceAppendixSummary(
      currentSessionData
    );

    const composedOutputObj = ComposedOutputSchema.parse({
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