
import { z } from 'zod';

export const ScoreResultSchema = z.object({
  score: z.number().min(0).max(1).default(0.0),
  confidence_vector: z.number().min(0).max(1).default(0.0),
  metrics: z.string().default(''),
  details: z.string().default(''),
  category_scores: z.string().default(''),
});

export type ScoreResult = z.infer<typeof ScoreResultSchema> & {
  isHighConfidence: boolean;
};

export const createScoreResult = (data?: Partial<ScoreResult>): ScoreResult => {
  const parsed = ScoreResultSchema.parse(data);
  return {
    ...parsed,
    get isHighConfidence(): boolean {
      return this.score > 0.7;
    },
  };
};
