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
exports.ReflectionStage = exports.AuditCheckResultSchema = void 0;
const zod_1 = require("zod");
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../../config");
const graphElements_1 = require("../models/graphElements");
const common_1 = require("../models/common");
const baseStage_1 = require("./baseStage");
const neo4jUtils_1 = require("../../infrastructure/neo4jUtils");
const compositionStage_1 = require("./compositionStage");
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
exports.AuditCheckResultSchema = zod_1.z.object({
    check_name: zod_1.z.string(),
    status: zod_1.z.enum(["NOT_RUN", "PASS", "WARNING", "FAIL", "NOT_APPLICABLE"]).default("NOT_RUN"),
    message: zod_1.z.string(),
    details: zod_1.z.record(zod_1.z.any()).optional(),
});
class ReflectionStage extends baseStage_1.BaseStage {
    constructor(settings) {
        var _a, _b, _c, _d, _e;
        super(settings);
        this.stageName = ReflectionStage.STAGE_NAME;
        // Configuration for confidence adjustments based on audit results
        this.confidenceAdjustments = {
            falsifiability: { pass: 0.15, warning: 0.05, fail: -0.20 },
            bias: { pass: 0.10, warning: 0.0, fail: -0.15 },
            statistical: { pass: 0.20, warning: -0.05, fail: -0.10 }
        };
        this.highConfidenceThreshold = ((_a = settings.asr_got.default_parameters) === null || _a === void 0 ? void 0 : _a.high_confidence_threshold) || 0.7;
        this.highImpactThreshold = ((_b = settings.asr_got.default_parameters) === null || _b === void 0 ? void 0 : _b.high_impact_threshold) || 0.7;
        this.minFalsifiableHypothesisRatio = ((_c = settings.asr_got.default_parameters) === null || _c === void 0 ? void 0 : _c.min_falsifiable_hypothesis_ratio) || 0.6;
        this.maxHighSeverityBiasNodes = ((_d = settings.asr_got.default_parameters) === null || _d === void 0 ? void 0 : _d.max_high_severity_bias_nodes) || 0;
        this.minPoweredEvidenceRatio = ((_e = settings.asr_got.default_parameters) === null || _e === void 0 ? void 0 : _e.min_powered_evidence_ratio) || 0.5;
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
    _logStart(sessionId) {
        logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
    }
    _logEnd(sessionId, output) {
        logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
    }
    _checkHighConfidenceImpactCoverageFromNeo4j() {
        return __awaiter(this, void 0, void 0, function* () {
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
                const results = yield (0, neo4jUtils_1.executeQuery)(query, {}, "read");
                if (!results || results.length === 0) {
                    return exports.AuditCheckResultSchema.parse({
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
                let status = "FAIL";
                if (confCoverage >= 0.3 && impactCoverage >= 0.2) {
                    status = "PASS";
                }
                else if (confCoverage >= 0.1 || impactCoverage >= 0.1) {
                    status = "WARNING";
                }
                return exports.AuditCheckResultSchema.parse({
                    check_name: "high_confidence_impact_coverage",
                    status: status,
                    message: message,
                });
            }
            catch (error) {
                logger.error(`Neo4j error in confidence/impact check: ${error.message}`, error);
                return exports.AuditCheckResultSchema.parse({
                    check_name: "high_confidence_impact_coverage",
                    status: "FAIL",
                    message: `Query error: ${error.message}`,
                });
            }
        });
    }
    _checkBiasFlagsAssessmentFromNeo4j() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = `
      MATCH (n:Node) WHERE n.metadata_bias_flags_json IS NOT NULL
      RETURN n.metadata_bias_flags_json AS bias_flags_json
    `;
            try {
                const results = yield (0, neo4jUtils_1.executeQuery)(query, {}, "read");
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
                            }
                            catch (e) {
                                logger.warn(`Could not parse bias_flags_json: ${e.message}`);
                            }
                        }
                    }
                }
                const message = `Found ${flaggedNodesCount} nodes with bias flags. ${highSeverityBiasCount} have high severity.`;
                let status = "PASS";
                if (highSeverityBiasCount > this.maxHighSeverityBiasNodes) {
                    status = "FAIL";
                }
                else if (flaggedNodesCount > 0) {
                    status = "WARNING";
                }
                return exports.AuditCheckResultSchema.parse({
                    check_name: "bias_flags_assessment",
                    status: status,
                    message: message,
                });
            }
            catch (error) {
                logger.error(`Error in bias flags check: ${error.message}`, error);
                return exports.AuditCheckResultSchema.parse({
                    check_name: "bias_flags_assessment",
                    status: "FAIL",
                    message: `Error processing bias flags: ${error.message}`,
                });
            }
        });
    }
    _checkKnowledgeGapsAddressedFromNeo4j(composedOutput) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = "MATCH (g:Node) WHERE g.metadata_is_knowledge_gap = true RETURN count(g) as gap_nodes_count";
            let gapNodesPresent = false;
            try {
                const results = yield (0, neo4jUtils_1.executeQuery)(query, {}, "read");
                if (results && results.length > 0 && results[0].gap_nodes_count > 0) {
                    gapNodesPresent = true;
                }
            }
            catch (error) {
                logger.error(`Neo4j error checking knowledge gaps: ${error.message}`, error);
                return exports.AuditCheckResultSchema.parse({
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
                return exports.AuditCheckResultSchema.parse({
                    check_name: "knowledge_gaps_addressed",
                    status: "NOT_APPLICABLE",
                    message: "No explicit knowledge gap nodes in graph.",
                });
            }
            const status = gapsMentionedInOutput ? "PASS" : "WARNING";
            const message = gapsMentionedInOutput
                ? "Knowledge gaps found in graph were addressed in output."
                : "Knowledge gaps found but might not be explicitly in output.";
            return exports.AuditCheckResultSchema.parse({
                check_name: "knowledge_gaps_addressed",
                status: status,
                message: message,
            });
        });
    }
    _checkHypothesisFalsifiabilityFromNeo4j() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = `
      MATCH (h:Node:HYPOTHESIS)
      RETURN h.metadata_falsification_criteria_json IS NOT NULL AS has_criteria
    `;
            try {
                const results = yield (0, neo4jUtils_1.executeQuery)(query, {}, "read");
                if (!results || results.length === 0) {
                    return exports.AuditCheckResultSchema.parse({
                        check_name: "hypothesis_falsifiability",
                        status: "NOT_APPLICABLE",
                        message: "No hypotheses found.",
                    });
                }
                const totalHypotheses = results.length;
                const falsifiableCount = results.filter(r => r.has_criteria).length;
                const ratio = totalHypotheses > 0 ? falsifiableCount / totalHypotheses : 0;
                const message = `${falsifiableCount}/${totalHypotheses} (${ratio.toFixed(2)}%) hypotheses have falsifiability criteria.`;
                let status = "FAIL";
                if (ratio >= this.minFalsifiableHypothesisRatio) {
                    status = "PASS";
                }
                else if (ratio > 0) {
                    status = "WARNING";
                }
                return exports.AuditCheckResultSchema.parse({
                    check_name: "hypothesis_falsifiability",
                    status: status,
                    message: message,
                });
            }
            catch (error) {
                logger.error(`Neo4j error in falsifiability check: ${error.message}`, error);
                return exports.AuditCheckResultSchema.parse({
                    check_name: "hypothesis_falsifiability",
                    status: "FAIL",
                    message: `Query error: ${error.message}`,
                });
            }
        });
    }
    _checkStatisticalRigorFromNeo4j() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = `
      MATCH (e:Node:EVIDENCE)
      RETURN e.metadata_statistical_power_json AS stat_power_json
    `;
            try {
                const results = yield (0, neo4jUtils_1.executeQuery)(query, {}, "read");
                if (!results || results.length === 0) {
                    return exports.AuditCheckResultSchema.parse({
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
                            const statPowerObj = graphElements_1.StatisticalPowerSchema.parse(JSON.parse(record.stat_power_json));
                            if (statPowerObj.value >= 0.7) {
                                adequatelyPoweredCount++;
                            }
                        }
                        catch (e) {
                            logger.warn(`Could not parse statistical_power_json: ${e.message}`);
                        }
                    }
                }
                const ratio = totalEvidence > 0 ? adequatelyPoweredCount / totalEvidence : 0;
                const message = `${adequatelyPoweredCount}/${totalEvidence} (${ratio.toFixed(2)}%) evidence nodes meet power criteria (>=0.7).`;
                const status = ratio >= this.minPoweredEvidenceRatio ? "PASS" : "WARNING";
                return exports.AuditCheckResultSchema.parse({
                    check_name: "statistical_rigor_of_evidence",
                    status: status,
                    message: message,
                });
            }
            catch (error) {
                logger.error(`Neo4j error in statistical rigor check: ${error.message}`, error);
                return exports.AuditCheckResultSchema.parse({
                    check_name: "statistical_rigor_of_evidence",
                    status: "FAIL",
                    message: `Query error: ${error.message}`,
                });
            }
        });
    }
    _checkCausalClaimValidity() {
        return __awaiter(this, void 0, void 0, function* () {
            return exports.AuditCheckResultSchema.parse({
                check_name: "causal_claim_validity",
                status: "NOT_RUN",
                message: "Causal claim validity check (Neo4j) not fully implemented.",
            });
        });
    }
    _checkTemporalConsistency() {
        return __awaiter(this, void 0, void 0, function* () {
            return exports.AuditCheckResultSchema.parse({
                check_name: "temporal_consistency",
                status: "NOT_RUN",
                message: "Temporal consistency check (Neo4j) not fully implemented.",
            });
        });
    }
    _checkCollaborationAttributions() {
        return __awaiter(this, void 0, void 0, function* () {
            return exports.AuditCheckResultSchema.parse({
                check_name: "collaboration_attributions_check",
                status: "NOT_RUN",
                message: "Attribution check (Neo4j) not fully implemented.",
            });
        });
    }
    _calculateFinalConfidence(auditResults) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Start with baseline confidence from settings or defaults
            const baselineConf = ((_a = this.settings.asr_got) === null || _a === void 0 ? void 0 : _a.initial_confidence) || [0.5, 0.5, 0.5, 0.5];
            const finalConf = common_1.ConfidenceVectorSchema.parse({
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
            const applyAdjustment = (current, adjustment) => {
                return Math.min(1.0, Math.max(0.0, current + adjustment));
            };
            if (falsifiabilityCheck) {
                const adjustment = this.confidenceAdjustments.falsifiability[falsifiabilityCheck.status.toLowerCase()] || 0;
                finalConf.methodological_rigor = applyAdjustment(finalConf.methodological_rigor, adjustment);
            }
            if (biasCheck) {
                const adjustment = this.confidenceAdjustments.bias[biasCheck.status.toLowerCase()] || 0;
                finalConf.methodological_rigor = applyAdjustment(finalConf.methodological_rigor, adjustment);
            }
            if (statRigorCheck) {
                const adjustment = this.confidenceAdjustments.statistical[statRigorCheck.status.toLowerCase()] || 0;
                finalConf.empirical_support = applyAdjustment(finalConf.empirical_support, adjustment);
            }
            // Calculate consensus alignment based on overall results
            const passCount = auditResults.filter(r => r.status === "PASS").length;
            const totalChecks = auditResults.filter(r => r.status !== "NOT_RUN").length;
            const consensusBonus = totalChecks > 0 ? (passCount / totalChecks - 0.5) * 0.2 : 0;
            finalConf.consensus_alignment = applyAdjustment(finalConf.consensus_alignment, consensusBonus);
            logger.info(`Calculated final confidence vector: ${JSON.stringify(finalConf)}`);
            return finalConf;
        });
    }
    execute(currentSessionData) {
        return __awaiter(this, void 0, void 0, function* () {
            this._logStart(currentSessionData.session_id);
            const compositionStageOutput = currentSessionData.accumulated_context.CompositionStage || {};
            const composedOutputDict = compositionStageOutput.final_composed_output;
            let composedOutputObj = undefined;
            if (composedOutputDict) {
                try {
                    composedOutputObj = compositionStage_1.ComposedOutputSchema.parse(composedOutputDict);
                }
                catch (e) {
                    logger.warn(`Could not parse ComposedOutput for reflection: ${e.message}`);
                }
            }
            const auditResults = [];
            const auditChecksToRun = {
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
                        auditResults.push(yield checkFunc());
                    }
                    catch (error) {
                        logger.error(`Error in audit check '${checkName}': ${error.message}`, error);
                        auditResults.push(exports.AuditCheckResultSchema.parse({
                            check_name: checkName,
                            status: "ERROR",
                            message: String(error),
                        }));
                    }
                }
            }
            const activeAuditResults = auditResults.filter(r => r.status !== "NOT_RUN");
            const finalConfidenceRaw = yield this._calculateFinalConfidence(activeAuditResults);
            const finalConfidenceVector = (0, common_1.createConfidenceVector)(finalConfidenceRaw);
            const passCount = activeAuditResults.filter(r => r.status === "PASS").length;
            const warningCount = activeAuditResults.filter(r => r.status === "WARNING").length;
            const failCount = activeAuditResults.filter(r => r.status === "FAIL").length;
            const summary = (`Reflection stage complete. Performed ${activeAuditResults.length} active audit checks. ` +
                `Final overall confidence assessed. ` +
                `PASS: ${passCount}, ` +
                `WARNING: ${warningCount}, ` +
                `FAIL: ${failCount}.`);
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
            const output = new baseStage_1.StageOutput(true, summary, { [this.stageName]: contextUpdate }, undefined, metrics);
            this._logEnd(currentSessionData.session_id, output);
            return output;
        });
    }
}
exports.ReflectionStage = ReflectionStage;
ReflectionStage.STAGE_NAME = "ReflectionStage";
