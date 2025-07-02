
import { z } from 'zod';

// Helper for probability distributions (list of floats summing to 1.0)
export const validateProbabilityDistribution = (v: number[], enforceNormalization: boolean = false): number[] => {
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

export const ProbabilityDistributionSchema = z.array(z.number()).superRefine((val, ctx) => {
  try {
    validateProbabilityDistribution(val);
  } catch (error: any) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error.message,
    });
  }
});

export type ProbabilityDistribution = z.infer<typeof ProbabilityDistributionSchema>;

// Confidence Vector based on P1.5
export const ConfidenceVectorSchema = z.object({
  empirical_support: z.number().min(0.0).max(1.0).default(0.5),
  theoretical_basis: z.number().min(0.0).max(1.0).default(0.5),
  methodological_rigor: z.number().min(0.0).max(1.0).default(0.5),
  consensus_alignment: z.number().min(0.0).max(1.0).default(0.5),
});

export type ConfidenceVector = z.infer<typeof ConfidenceVectorSchema> & {
  toList(): number[];
  averageConfidence: number;
};

export const createConfidenceVector = (data?: Partial<ConfidenceVector>): ConfidenceVector => {
  const parsed = ConfidenceVectorSchema.parse(data);
  return {
    ...parsed,
    toList(): number[] {
      return [
        this.empirical_support,
        this.theoretical_basis,
        this.methodological_rigor,
        this.consensus_alignment,
      ];
    },
    get averageConfidence(): number {
      return this.toList().reduce((sum, val) => sum + val, 0) / 4.0;
    },
  };
};

export const ConfidenceVectorFromList = (values: number[]): ConfidenceVector => {
  if (values.length !== 4) {
    throw new Error("Confidence list must have exactly 4 values.");
  }
  return createConfidenceVector({
    empirical_support: values[0],
    theoretical_basis: values[1],
    methodological_rigor: values[2],
    consensus_alignment: values[3],
  });
};

// Single scalar certainty/confidence if needed
export const CertaintyScoreSchema = z.number().min(0.0).max(1.0);
export type CertaintyScore = z.infer<typeof CertaintyScoreSchema>;

// Impact Score (P1.28)
export const ImpactScoreSchema = z.number().min(0.0).max(1.0);
export type ImpactScore = z.infer<typeof ImpactScoreSchema>;

export const TimestampedModelSchema = z.object({
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export type TimestampedModel = z.infer<typeof TimestampedModelSchema> & {
  touch(): void;
};

export const createTimestampedModel = (data?: Partial<TimestampedModel>): TimestampedModel => {
  const parsed = TimestampedModelSchema.parse(data);
  return {
    ...parsed,
    touch(): void {
      try {
        this.updated_at = new Date();
      } catch (error) {
        // Object might be frozen/immutable, skip update
        console.warn('Cannot update timestamp on immutable object');
      }
    },
  };
};

// Standardized way to represent a probability distribution for discrete outcomes
export const DiscreteProbabilityDistributionSchema = z.object({
  outcomes: z.array(z.string()),
  probabilities: ProbabilityDistributionSchema,
});

export type DiscreteProbabilityDistribution = z.infer<typeof DiscreteProbabilityDistributionSchema>;

export const RevisionRecordSchema = z.object({
  timestamp: z.date().default(() => new Date()),
  user_or_process: z.string(),
  action: z.string(),
  changes_made: z.record(z.any()).default({}),
  reason: z.string().default(''),
});

export type RevisionRecord = z.infer<typeof RevisionRecordSchema>;

export enum EpistemicStatus {
  ASSUMPTION = "assumption",
  HYPOTHESIS = "hypothesis",
  EVIDENCE_SUPPORTED = "evidence_supported",
  EVIDENCE_CONTRADICTED = "evidence_contradicted",
  THEORETICALLY_DERIVED = "theoretically_derived",
  WIDELY_ACCEPTED = "widely_accepted",
  DISPUTED = "disputed",
  UNKNOWN = "unknown",
  INFERRED = "inferred",
  SPECULATION = "speculation",
}
