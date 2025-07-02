"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpistemicStatus = exports.RevisionRecordSchema = exports.DiscreteProbabilityDistributionSchema = exports.createTimestampedModel = exports.TimestampedModelSchema = exports.ImpactScoreSchema = exports.CertaintyScoreSchema = exports.ConfidenceVectorFromList = exports.createConfidenceVector = exports.ConfidenceVectorSchema = exports.ProbabilityDistributionSchema = exports.validateProbabilityDistribution = void 0;
const zod_1 = require("zod");
// Helper for probability distributions (list of floats summing to 1.0)
const validateProbabilityDistribution = (v, enforceNormalization = false) => {
    if (!v) {
        return v;
    }
    if (!v.every(p => p >= 0.0 && p <= 1.0)) {
        throw new Error("All probabilities must be between 0.0 and 1.0");
    }
    const sum = v.reduce((sum, p) => sum + p, 0);
    if (enforceNormalization && sum > 0) {
        const tolerance = 1e-6;
        if (Math.abs(sum - 1.0) > tolerance) {
            throw new Error(`Probabilities must sum to 1.0, but sum is ${sum.toFixed(6)}`);
        }
    }
    return v;
};
exports.validateProbabilityDistribution = validateProbabilityDistribution;
exports.ProbabilityDistributionSchema = zod_1.z.array(zod_1.z.number()).superRefine((val, ctx) => {
    try {
        (0, exports.validateProbabilityDistribution)(val);
    }
    catch (error) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: error.message,
        });
    }
});
// Confidence Vector based on P1.5
exports.ConfidenceVectorSchema = zod_1.z.object({
    empirical_support: zod_1.z.number().min(0.0).max(1.0).default(0.5),
    theoretical_basis: zod_1.z.number().min(0.0).max(1.0).default(0.5),
    methodological_rigor: zod_1.z.number().min(0.0).max(1.0).default(0.5),
    consensus_alignment: zod_1.z.number().min(0.0).max(1.0).default(0.5),
});
const createConfidenceVector = (data) => {
    const parsed = exports.ConfidenceVectorSchema.parse(data);
    return Object.assign(Object.assign({}, parsed), { toList() {
            return [
                this.empirical_support,
                this.theoretical_basis,
                this.methodological_rigor,
                this.consensus_alignment,
            ];
        },
        get averageConfidence() {
            return this.toList().reduce((sum, val) => sum + val, 0) / 4.0;
        } });
};
exports.createConfidenceVector = createConfidenceVector;
const ConfidenceVectorFromList = (values) => {
    if (values.length !== 4) {
        throw new Error("Confidence list must have exactly 4 values.");
    }
    return (0, exports.createConfidenceVector)({
        empirical_support: values[0],
        theoretical_basis: values[1],
        methodological_rigor: values[2],
        consensus_alignment: values[3],
    });
};
exports.ConfidenceVectorFromList = ConfidenceVectorFromList;
// Single scalar certainty/confidence if needed
exports.CertaintyScoreSchema = zod_1.z.number().min(0.0).max(1.0);
// Impact Score (P1.28)
exports.ImpactScoreSchema = zod_1.z.number().min(0.0).max(1.0);
exports.TimestampedModelSchema = zod_1.z.object({
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
const createTimestampedModel = (data) => {
    const parsed = exports.TimestampedModelSchema.parse(data);
    return Object.assign(Object.assign({}, parsed), { touch() {
            try {
                this.updated_at = new Date();
            }
            catch (error) {
                // Object might be frozen/immutable, skip update
                console.warn('Cannot update timestamp on immutable object');
            }
        } });
};
exports.createTimestampedModel = createTimestampedModel;
// Standardized way to represent a probability distribution for discrete outcomes
exports.DiscreteProbabilityDistributionSchema = zod_1.z.object({
    outcomes: zod_1.z.array(zod_1.z.string()),
    probabilities: exports.ProbabilityDistributionSchema,
});
exports.RevisionRecordSchema = zod_1.z.object({
    timestamp: zod_1.z.date().default(() => new Date()),
    user_or_process: zod_1.z.string(),
    action: zod_1.z.string(),
    changes_made: zod_1.z.record(zod_1.z.any()).default({}),
    reason: zod_1.z.string().default(''),
});
var EpistemicStatus;
(function (EpistemicStatus) {
    EpistemicStatus["ASSUMPTION"] = "assumption";
    EpistemicStatus["HYPOTHESIS"] = "hypothesis";
    EpistemicStatus["EVIDENCE_SUPPORTED"] = "evidence_supported";
    EpistemicStatus["EVIDENCE_CONTRADICTED"] = "evidence_contradicted";
    EpistemicStatus["THEORETICALLY_DERIVED"] = "theoretically_derived";
    EpistemicStatus["WIDELY_ACCEPTED"] = "widely_accepted";
    EpistemicStatus["DISPUTED"] = "disputed";
    EpistemicStatus["UNKNOWN"] = "unknown";
    EpistemicStatus["INFERRED"] = "inferred";
    EpistemicStatus["SPECULATION"] = "speculation";
})(EpistemicStatus || (exports.EpistemicStatus = EpistemicStatus = {}));
