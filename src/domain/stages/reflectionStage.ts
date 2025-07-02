import { z } from 'zod';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { StatisticalPowerSchema } from '../models/graphElements';
import { ConfidenceVectorSchema, createConfidenceVector } from '../models/common';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';
import { ComposedOutputSchema } from './compositionStage';

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

export const AuditCheckResultSchema = z.object({
  check_name: z.string(),
  status: z.enum(["NOT_RUN", "PASS", "WARNING", "FAIL", "NOT_APPLICABLE"]).default("NOT_RUN"),
  message: z.string(),
  details: z.record(z.any()).optional(),
});

export type AuditCheckResult = z.infer<typeof AuditCheckResultSchema>;

export class ReflectionStage extends BaseStage {
  static STAGE_NAME: string = "ReflectionStage";
  stageName: string = ReflectionStage.STAGE_NAME;
  private highConfidenceThreshold: number;
  private highImpactThreshold: number;
  private minFalsifiableHypothesisRatio: number;
  private maxHighSeverityBiasNodes: number;
  private minPoweredEvidenceRatio: number;
  
  // Configuration for confidence adjustments based on audit results
  private confidenceAdjustments = {
    falsifiability: { pass: 0.15, warning: 0.05, fail: -0.20 },
    bias: { pass: 0.10, warning: 0.0, fail: -0.15 },
    statistical: { pass: 0.20, warning: -0.05, fail: -0.10 }
  };
  private auditChecklistItems: string[];

  constructor(settings: any) {
    super(settings);
    this.highConfidenceThreshold = settings.asr_got.default_parameters?.high_confidence_threshold || 0.7;
    this.highImpactThreshold = settings.asr_got.default_parameters?.high_impact_threshold || 0.7;
    this.minFalsifiableHypothesisRatio = settings.asr_got.default_parameters?.min_falsifiable_hypothesis_ratio || 0.6;
    this.maxHighSeverityBiasNodes = settings.asr_got.default_parameters?.max_high_severity_bias_nodes || 0;
    this.minPoweredEvidenceRatio = settings.asr_got.default_parameters?.min_powered_evidence_ratio || 0.5;
    this.auditChecklistItems = [
      "high_confidence_impact_coverage",
      "bias_flags_assessment",
      "knowledge_gaps_addressed",
      "hypothesis_falsifiability",
      "causal_claim_validity",
      "temporal_consistency",
      "statistical_rigor_of_evidence",
      "collaboration_attributions_check",
    ];
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  private async _checkHighConfidenceImpactCoverageFromNeo4j(): Promise<AuditCheckResult> {
    const query = `
      MATCH (n:Node)
      WHERE n.type IN ['HYPOTHESIS', 'EVIDENCE', 'INTERDISCIPLINARY_BRIDGE']
      RETURN n.confidence_overall_avg AS avg_confidence,
             n.metadata_impact_score AS impact_score,
             n.confidence_empirical_support AS emp,
             n.confidence_theoretical_basis AS theo,
             n.confidence_methodological_rigor AS meth,
             n.confidence_consensus_alignment AS cons
    `;
    try {
      const results = await executeQuery(query, {}, "read");
      if (!results || results.length === 0) {
        return AuditCheckResultSchema.parse({
          check_name: "high_confidence_impact_coverage",
          status: "NOT_APPLICABLE",
          message: "No relevant nodes found.",
        });
      }

      let highConfNodes = 0;
      let highImpactNodes = 0;
      const totalRelevantNodes = results.length;

      for (const record of results) {
        let avgConf = record.avg_confidence;
        if (avgConf === undefined || avgConf === null) {
          const confComponents = [
            record.emp || 0.0,
            record.theo || 0.0,
            record.meth || 0.0,
            record.cons || 0.0,
          ];
          const validComponents = confComponents.filter(c => typeof c === 'number');
          avgConf = validComponents.length > 0 ? validComponents.reduce((sum, c) => sum + c, 0) / validComponents.length : 0.0;
        }

        const impact = record.impact_score || 0.0;
        if (avgConf >= this.highConfidenceThreshold) {
          highConfNodes++;
        }
        if (impact >= this.highImpactThreshold) {
          highImpactNodes++;
        }
      }

      const confCoverage = totalRelevantNodes > 0 ? highConfNodes / totalRelevantNodes : 0;
      const impactCoverage = totalRelevantNodes > 0 ? highImpactNodes / totalRelevantNodes : 0;
      const message = `Confidence coverage: ${confCoverage.toFixed(2)}%. Impact coverage: ${impactCoverage.toFixed(2)}%.`;
      let status: AuditCheckResult['status'] = "FAIL";
      if (confCoverage >= 0.3 && impactCoverage >= 0.2) {
        status = "PASS";
      } else if (confCoverage >= 0.1 || impactCoverage >= 0.1) {
        status = "WARNING";
      }
      return AuditCheckResultSchema.parse({
        check_name: "high_confidence_impact_coverage",
        status: status,
        message: message,
      });
    } catch (error: any) {
      logger.error(`Neo4j error in confidence/impact check: ${error.message}`, error);
      return AuditCheckResultSchema.parse({
        check_name: "high_confidence_impact_coverage",
        status: "FAIL",
        message: `Query error: ${error.message}`,
      });
    }
  }

  private async _checkBiasFlagsAssessmentFromNeo4j(): Promise<AuditCheckResult> {
    const query = `
      MATCH (n:Node) WHERE n.metadata_bias_flags_json IS NOT NULL
      RETURN n.metadata_bias_flags_json AS bias_flags_json
    `;
    try {
      const results = await executeQuery(query, {}, "read");
      let flaggedNodesCount = 0;
      let highSeverityBiasCount = 0;
      if (results && results.length > 0) {
        flaggedNodesCount = results.length;
        for (const record of results) {
          if (record.bias_flags_json) {
            try {
              const biasFlagsList = JSON.parse(record.bias_flags_json);
              for (const flagDict of biasFlagsList) {
                // Assuming BiasFlagSchema can parse the dict
                const biasFlag = flagDict; // Simplified, assuming direct compatibility or will parse later
                if (biasFlag.severity === "high") {
                  highSeverityBiasCount++;
                }
              }
            } catch (e: any) {
              logger.warn(`Could not parse bias_flags_json: ${e.message}`);
            }
          }
        }
      }

      const message = `Found ${flaggedNodesCount} nodes with bias flags. ${highSeverityBiasCount} have high severity.`;
      let status: AuditCheckResult['status'] = "PASS";
      if (highSeverityBiasCount > this.maxHighSeverityBiasNodes) {
        status = "FAIL";
      } else if (flaggedNodesCount > 0) {
        status = "WARNING";
      }
      return AuditCheckResultSchema.parse({
        check_name: "bias_flags_assessment",
        status: status,
        message: message,
      });
    } catch (error: any) {
      logger.error(`Error in bias flags check: ${error.message}`, error);
      return AuditCheckResultSchema.parse({
        check_name: "bias_flags_assessment",
        status: "FAIL",
        message: `Error processing bias flags: ${error.message}`,
      });
    }
  }

  private async _checkKnowledgeGapsAddressedFromNeo4j(
    composedOutput: z.infer<typeof ComposedOutputSchema> | undefined
  ): Promise<AuditCheckResult> {
    const query = "MATCH (g:Node) WHERE g.metadata_is_knowledge_gap = true RETURN count(g) as gap_nodes_count";
    let gapNodesPresent = false;
    try {
      const results = await executeQuery(query, {}, "read");
      if (results && results.length > 0 && results[0].gap_nodes_count > 0) {
        gapNodesPresent = true;
      }
    } catch (error: any) {
      logger.error(`Neo4j error checking knowledge gaps: ${error.message}`, error);
      return AuditCheckResultSchema.parse({
        check_name: "knowledge_gaps_addressed",
        status: "FAIL",
        message: `Query error: ${error.message}`,
      });
    }

    let gapsMentionedInOutput = false;
    if (composedOutput) {
      for (const section of composedOutput.sections || []) {
        if (section.title.toLowerCase().includes("gap") || (section.type && section.type.toLowerCase().includes("gap"))) {
          gapsMentionedInOutput = true;
          break;
        }
      }
    }

    if (!gapNodesPresent) {
      return AuditCheckResultSchema.parse({
        check_name: "knowledge_gaps_addressed",
        status: "NOT_APPLICABLE",
        message: "No explicit knowledge gap nodes in graph.",
      });
    }
    const status: AuditCheckResult['status'] = gapsMentionedInOutput ? "PASS" : "WARNING";
    const message = gapsMentionedInOutput
      ? "Knowledge gaps found in graph were addressed in output."
      : "Knowledge gaps found but might not be explicitly in output.";
    return AuditCheckResultSchema.parse({
      check_name: "knowledge_gaps_addressed",
      status: status,
      message: message,
    });
  }

  private async _checkHypothesisFalsifiabilityFromNeo4j(): Promise<AuditCheckResult> {
    const query = `
      MATCH (h:Node:HYPOTHESIS)
      RETURN h.metadata_falsification_criteria_json IS NOT NULL AS has_criteria
    `;
    try {
      const results = await executeQuery(query, {}, "read");
      if (!results || results.length === 0) {
        return AuditCheckResultSchema.parse({
          check_name: "hypothesis_falsifiability",
          status: "NOT_APPLICABLE",
          message: "No hypotheses found.",
        });
      }

      const totalHypotheses = results.length;
      const falsifiableCount = results.filter(r => r.has_criteria).length;
      const ratio = totalHypotheses > 0 ? falsifiableCount / totalHypotheses : 0;
      const message = `${falsifiableCount}/${totalHypotheses} (${ratio.toFixed(2)}%) hypotheses have falsifiability criteria.`;
      let status: AuditCheckResult['status'] = "FAIL";
      if (ratio >= this.minFalsifiableHypothesisRatio) {
        status = "PASS";
      } else if (ratio > 0) {
        status = "WARNING";
      }
      return AuditCheckResultSchema.parse({
        check_name: "hypothesis_falsifiability",
        status: status,
        message: message,
      });
    } catch (error: any) {
      logger.error(`Neo4j error in falsifiability check: ${error.message}`, error);
      return AuditCheckResultSchema.parse({
        check_name: "hypothesis_falsifiability",
        status: "FAIL",
        message: `Query error: ${error.message}`,
      });
    }
  }

  private async _checkStatisticalRigorFromNeo4j(): Promise<AuditCheckResult> {
    const query = `
      MATCH (e:Node:EVIDENCE)
      RETURN e.metadata_statistical_power_json AS stat_power_json
    `;
    try {
      const results = await executeQuery(query, {}, "read");
      if (!results || results.length === 0) {
        return AuditCheckResultSchema.parse({
          check_name: "statistical_rigor_of_evidence",
          status: "NOT_APPLICABLE",
          message: "No evidence nodes.",
        });
      }

      const totalEvidence = results.length;
      let adequatelyPoweredCount = 0;
      for (const record of results) {
        if (record.stat_power_json) {
          try {
            const statPowerObj = StatisticalPowerSchema.parse(JSON.parse(record.stat_power_json));
            if (statPowerObj.value >= 0.7) {
              adequatelyPoweredCount++;
            }
          } catch (e: any) {
            logger.warn(`Could not parse statistical_power_json: ${e.message}`);
          }
        }
      }

      const ratio = totalEvidence > 0 ? adequatelyPoweredCount / totalEvidence : 0;
      const message = `${adequatelyPoweredCount}/${totalEvidence} (${ratio.toFixed(2)}%) evidence nodes meet power criteria (>=0.7).`;
      const status: AuditCheckResult['status'] = ratio >= this.minPoweredEvidenceRatio ? "PASS" : "WARNING";
      return AuditCheckResultSchema.parse({
        check_name: "statistical_rigor_of_evidence",
        status: status,
        message: message,
      });
    } catch (error: any) {
      logger.error(`Neo4j error in statistical rigor check: ${error.message}`, error);
      return AuditCheckResultSchema.parse({
        check_name: "statistical_rigor_of_evidence",
        status: "FAIL",
        message: `Query error: ${error.message}`,
      });
    }
  }

  private async _checkCausalClaimValidity(): Promise<AuditCheckResult> {
    return AuditCheckResultSchema.parse({
      check_name: "causal_claim_validity",
      status: "NOT_RUN",
      message: "Causal claim validity check (Neo4j) not fully implemented.",
    });
  }

  private async _checkTemporalConsistency(): Promise<AuditCheckResult> {
    return AuditCheckResultSchema.parse({
      check_name: "temporal_consistency",
      status: "NOT_RUN",
      message: "Temporal consistency check (Neo4j) not fully implemented.",
    });
  }

  private async _checkCollaborationAttributions(): Promise<AuditCheckResult> {
    return AuditCheckResultSchema.parse({
      check_name: "collaboration_attributions_check",
      status: "NOT_RUN",
      message: "Attribution check (Neo4j) not fully implemented.",
    });
  }

  private async _calculateFinalConfidence(
    auditResults: AuditCheckResult[]
  ): Promise<z.infer<typeof ConfidenceVectorSchema>> {
    // Start with baseline confidence from settings or defaults
    const baselineConf = this.settings.asr_got?.initial_confidence || [0.5, 0.5, 0.5, 0.5];
    const finalConf = ConfidenceVectorSchema.parse({
      empirical_support: baselineConf[0] || 0.5,
      theoretical_basis: baselineConf[1] || 0.5,
      methodological_rigor: baselineConf[2] || 0.5,
      consensus_alignment: baselineConf[3] || 0.5,
    });

    // Apply adjustments based on audit results
    const falsifiabilityCheck = auditResults.find(r => r.check_name === "hypothesis_falsifiability");
    const biasCheck = auditResults.find(r => r.check_name === "bias_flags_assessment");
    const statRigorCheck = auditResults.find(r => r.check_name === "statistical_rigor_of_evidence");

    // Validate that adjustments don't exceed reasonable bounds
    const applyAdjustment = (current: number, adjustment: number): number => {
      return Math.min(1.0, Math.max(0.0, current + adjustment));
    };

    if (falsifiabilityCheck) {
      const adjustment = this.confidenceAdjustments.falsifiability[falsifiabilityCheck.status.toLowerCase() as keyof typeof this.confidenceAdjustments.falsifiability] || 0;
      finalConf.methodological_rigor = applyAdjustment(finalConf.methodological_rigor, adjustment);
    }

    if (biasCheck) {
      const adjustment = this.confidenceAdjustments.bias[biasCheck.status.toLowerCase() as keyof typeof this.confidenceAdjustments.bias] || 0;
      finalConf.methodological_rigor = applyAdjustment(finalConf.methodological_rigor, adjustment);
    }

    if (statRigorCheck) {
      const adjustment = this.confidenceAdjustments.statistical[statRigorCheck.status.toLowerCase() as keyof typeof this.confidenceAdjustments.statistical] || 0;
      finalConf.empirical_support = applyAdjustment(finalConf.empirical_support, adjustment);
    }

    // Calculate consensus alignment based on overall results
    const passCount = auditResults.filter(r => r.status === "PASS").length;
    const totalChecks = auditResults.filter(r => r.status !== "NOT_RUN").length;
    const consensusBonus = totalChecks > 0 ? (passCount / totalChecks - 0.5) * 0.2 : 0;
    finalConf.consensus_alignment = applyAdjustment(finalConf.consensus_alignment, consensusBonus);

    logger.info(`Calculated final confidence vector: ${JSON.stringify(finalConf)}`);
    return finalConf;
  }

  async execute(
    currentSessionData: GoTProcessorSessionData
  ): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);
    const compositionStageOutput = currentSessionData.accumulated_context.CompositionStage || {};
    const composedOutputDict = compositionStageOutput.final_composed_output;
    let composedOutputObj: z.infer<typeof ComposedOutputSchema> | undefined = undefined;
    if (composedOutputDict) {
      try {
        composedOutputObj = ComposedOutputSchema.parse(composedOutputDict);
      } catch (e: any) {
        logger.warn(`Could not parse ComposedOutput for reflection: ${e.message}`);
      }
    }

    const auditResults: AuditCheckResult[] = [];
    const auditChecksToRun: Record<string, () => Promise<AuditCheckResult>> = {
      high_confidence_impact_coverage: () => this._checkHighConfidenceImpactCoverageFromNeo4j(),
      bias_flags_assessment: () => this._checkBiasFlagsAssessmentFromNeo4j(),
      knowledge_gaps_addressed: () => this._checkKnowledgeGapsAddressedFromNeo4j(composedOutputObj),
      hypothesis_falsifiability: () => this._checkHypothesisFalsifiabilityFromNeo4j(),
      statistical_rigor_of_evidence: () => this._checkStatisticalRigorFromNeo4j(),
      causal_claim_validity: () => this._checkCausalClaimValidity(),
      temporal_consistency: () => this._checkTemporalConsistency(),
      collaboration_attributions_check: () => this._checkCollaborationAttributions(),
    };

    for (const checkName of this.auditChecklistItems) {
      const checkFunc = auditChecksToRun[checkName];
      if (checkFunc) {
        try {
          auditResults.push(await checkFunc());
        } catch (error: any) {
          logger.error(`Error in audit check '${checkName}': ${error.message}`, error);
          auditResults.push(
            AuditCheckResultSchema.parse({
              check_name: checkName,
              status: "ERROR",
              message: String(error),
            })
          );
        }
      }
    }

    const activeAuditResults = auditResults.filter(r => r.status !== "NOT_RUN");
    const finalConfidenceRaw = await this._calculateFinalConfidence(
      activeAuditResults
    );
    const finalConfidenceVector = createConfidenceVector(finalConfidenceRaw);

    const passCount = activeAuditResults.filter(r => r.status === "PASS").length;
    const warningCount = activeAuditResults.filter(r => r.status === "WARNING").length;
    const failCount = activeAuditResults.filter(r => r.status === "FAIL").length;

    const summary = (
      `Reflection stage complete. Performed ${activeAuditResults.length} active audit checks. ` +
      `Final overall confidence assessed. ` +
      `PASS: ${passCount}, ` +
      `WARNING: ${warningCount}, ` +
      `FAIL: ${failCount}.`
    );
    const metrics = {
      audit_checks_performed_count: activeAuditResults.length,
      audit_pass_count: passCount,
      audit_warning_count: warningCount,
      audit_fail_count: failCount,
      final_confidence_empirical: finalConfidenceVector.empirical_support,
      final_confidence_theoretical: finalConfidenceVector.theoretical_basis,
      final_confidence_methodological: finalConfidenceVector.methodological_rigor,
      final_confidence_consensus: finalConfidenceVector.consensus_alignment,
    };
    const contextUpdate = {
      final_confidence_vector_from_reflection: finalConfidenceVector.toList(),
      audit_check_results: auditResults.map(res => res),
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