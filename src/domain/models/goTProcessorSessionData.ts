import { z } from 'zod';

export const GoTProcessorSessionDataSchema = z.object({
  session_id: z.string().default(''),
  query: z.string().default(''),
  final_answer: z.string().default(''),
  final_confidence_vector: z.string().default('0.5,0.5,0.5,0.5'), // Simplified as string
  accumulated_context: z.record(z.any()).default({}),
  stage_outputs_trace: z.array(z.record(z.any())).default([]),
});

export type GoTProcessorSessionData = z.infer<typeof GoTProcessorSessionDataSchema>;