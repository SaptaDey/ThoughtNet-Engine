
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

export const ComposedOutputSchema = z.object({
  executive_summary: z.string().default(''),
  detailed_report: z.string().default(''),
  key_findings: z.string().default(''), // Simplified as string instead of list
  confidence_assessment: z.string().default(''), // Simplified as JSON string
});

export type ComposedOutput = z.infer<typeof ComposedOutputSchema>;
