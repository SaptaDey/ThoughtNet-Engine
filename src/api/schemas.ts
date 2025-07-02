

import { z } from 'zod';

// --- Generic JSON-RPC Models ---
export const NLQPayloadSchema = z.object({
  question: z.string().max(2000).transform(v => v.replace(/\r/g, ' ').replace(/\n/g, ' ').trim().replace(/\s+/g, ' ')),
});

export type NLQPayload = z.infer<typeof NLQPayloadSchema>;

export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal("2.0").default("2.0"),
  method: z.string(),
  params: z.any().optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

export type JSONRPCRequest<T = any> = z.infer<typeof JSONRPCRequestSchema> & { params?: T };

export const JSONRPCErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.any().optional(),
});

export type JSONRPCErrorObject<E = any> = z.infer<typeof JSONRPCErrorObjectSchema> & { data?: E };

export const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal("2.0").default("2.0"),
  result: z.any().optional(),
  error: JSONRPCErrorObjectSchema.optional(),
  id: z.union([z.string(), z.number(), z.null()]),
}).superRefine((val, ctx) => {
  if (val.result !== undefined && val.error !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Both "result" and "error" cannot be present in a JSONRPCResponse',
      path: ['result', 'error'],
    });
  }
  if (val.result === undefined && val.error === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either "result" or "error" must be present in a JSONRPCResponse',
      path: ['result', 'error'],
    });
  }
});

export type JSONRPCResponse<T = any, E = any> = z.infer<typeof JSONRPCResponseSchema> & { result?: T; error?: JSONRPCErrorObject<E> };

// --- MCP Specific Schemas ---

export const MCPInitializeClientInfoSchema = z.object({
  client_name: z.string().optional(),
  client_version: z.string().optional(),
  supported_mcp_versions: z.array(z.string()).default([]),
});

export type MCPInitializeClientInfo = z.infer<typeof MCPInitializeClientInfoSchema>;

export const MCPInitializeParamsSchema = z.object({
  process_id: z.number().int().optional(),
  client_info: MCPInitializeClientInfoSchema.default({}),
});

export type MCPInitializeParams = z.infer<typeof MCPInitializeParamsSchema>;

export const MCPInitializeResultSchema = z.object({
  server_name: z.string().default("Adaptive Graph of Thoughts-MCP"),
  server_version: z.string().default("0.1.0"),
  mcp_version: z.string().default("0.1.0"),
});

export type MCPInitializeResult = z.infer<typeof MCPInitializeResultSchema>;

export const MCPQueryContextSchema = z.object({
  conversation_id: z.string().optional(),
  history: z.array(z.record(z.any())).optional(),
  user_preferences: z.record(z.any()).optional(),
});

export type MCPQueryContext = z.infer<typeof MCPQueryContextSchema>;

export const MCPQueryOperationalParamsSchema = z.object({
  include_reasoning_trace: z.boolean().default(true),
  include_graph_state: z.boolean().default(true),
  max_nodes_in_response_graph: z.number().int().min(0).optional().default(50),
  output_detail_level: z.enum(["summary", "detailed"]).optional().default("summary"),
});

export type MCPQueryOperationalParams = z.infer<typeof MCPQueryOperationalParamsSchema>;

export const MCPASRGoTQueryParamsSchema = z.object({
  query: z.string(),
  context: MCPQueryContextSchema.default({}),
  parameters: MCPQueryOperationalParamsSchema.default({}),
  session_id: z.string().optional(),
});

export type MCPASRGoTQueryParams = z.infer<typeof MCPASRGoTQueryParamsSchema>;

export const GraphNodeSchema = z.object({
  node_id: z.string(),
  label: z.string(),
  type: z.string(),
  confidence: z.array(z.number()).optional(),
  metadata: z.record(z.any()).default({}),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  edge_id: z.string(),
  source: z.string(),
  target: z.string(),
  edge_type: z.string(),
  confidence: z.number().optional(),
  metadata: z.record(z.any()).default({}),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphHyperedgeSchema = z.object({
  edge_id: z.string(),
  nodes: z.array(z.string()),
  confidence: z.number().optional(),
  metadata: z.record(z.any()).default({}),
});

export type GraphHyperedge = z.infer<typeof GraphHyperedgeSchema>;

export const GraphStateSchema = z.object({
  nodes: z.array(GraphNodeSchema).default([]),
  edges: z.array(GraphEdgeSchema).default([]),
  hyperedges: z.array(GraphHyperedgeSchema).default([]),
  layers: z.record(z.array(z.string())).optional(),
  metadata: z.record(z.any()).default({}),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

export const MCPASRGoTQueryResultSchema = z.object({
  answer: z.string(),
  reasoning_trace_summary: z.string().optional(),
  graph_state_full: GraphStateSchema.optional(),
  confidence_vector: z.array(z.number()).optional(),
  execution_time_ms: z.number().int().optional(),
  session_id: z.string().optional(),
});

export type MCPASRGoTQueryResult = z.infer<typeof MCPASRGoTQueryResultSchema>;

export const GoTQueryInputSchema = z.object({
  query: z.string(),
  config_override: z.record(z.any()).optional(),
  session_id: z.string().optional(),
});

export type GoTQueryInput = z.infer<typeof GoTQueryInputSchema>;

export const GoTQueryThoughtStepSchema = z.object({
  stage_name: z.string(),
  summary: z.string(),
});

export type GoTQueryThoughtStep = z.infer<typeof GoTQueryThoughtStepSchema>;

export const GoTQueryProgressParamsSchema = z.object({
  session_id: z.string(),
  stage: z.string(),
  status: z.string(),
  message: z.string().optional(),
  progress_percentage: z.number().min(0.0).max(100.0).optional(),
  intermediate_results: z.array(GoTQueryThoughtStepSchema).optional(),
});

export type GoTQueryProgressParams = z.infer<typeof GoTQueryProgressParamsSchema>;

export const GoTQueryProgressNotificationSchema = JSONRPCRequestSchema.extend({
  method: z.literal("got/queryProgress"),
  params: GoTQueryProgressParamsSchema,
});

export type GoTQueryProgressNotification = z.infer<typeof GoTQueryProgressNotificationSchema>;

export const GoTQueryFinalResultSchema = z.object({
  session_id: z.string(),
  final_answer: z.string(),
  confidence_vector: z.array(z.number()).optional(),
  supporting_evidence_ids: z.array(z.string()).optional(),
  full_graph_summary: z.record(z.any()).optional(),
});

export type GoTQueryFinalResult = z.infer<typeof GoTQueryFinalResultSchema>;

// --- Standard MCP Notification/Request structures ---
export const SetTraceParamsSchema = z.object({
  value: z.enum(["off", "messages", "verbose"]),
});

export type SetTraceParams = z.infer<typeof SetTraceParamsSchema>;

export const SetTraceNotificationSchema = JSONRPCRequestSchema.extend({
  method: z.literal("$/setTrace"),
  params: SetTraceParamsSchema,
});

export type SetTraceNotification = z.infer<typeof SetTraceNotificationSchema>;

export const LogTraceParamsSchema = z.object({
  message: z.string(),
  verbose: z.string().optional(),
});

export type LogTraceParams = z.infer<typeof LogTraceParamsSchema>;

export const LogTraceNotificationSchema = JSONRPCRequestSchema.extend({
  method: z.literal("$/logTrace"),
  params: LogTraceParamsSchema,
});

export type LogTraceNotification = z.infer<typeof LogTraceNotificationSchema>;

// --- Shutdown and Exit ---
export const ShutdownParamsSchema = z.object({});
export type ShutdownParams = z.infer<typeof ShutdownParamsSchema>;

export const ShutdownResultSchema = z.object({});
export type ShutdownResult = z.infer<typeof ShutdownResultSchema>;

export const ExitParamsSchema = z.object({});
export type ExitParams = z.infer<typeof ExitParamsSchema>;

export function createJsonRpcError<E = any>(
  requestId: string | number | null | undefined,
  code: number,
  message: string,
  data?: E
): JSONRPCResponse<any, E> {
  const errorObj = JSONRPCErrorObjectSchema.parse({ code, message, data });
  return JSONRPCResponseSchema.parse({ id: requestId, error: errorObj, result: undefined });
}
