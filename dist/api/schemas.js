"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitParamsSchema = exports.ShutdownResultSchema = exports.ShutdownParamsSchema = exports.LogTraceNotificationSchema = exports.LogTraceParamsSchema = exports.SetTraceNotificationSchema = exports.SetTraceParamsSchema = exports.GoTQueryFinalResultSchema = exports.GoTQueryProgressNotificationSchema = exports.GoTQueryProgressParamsSchema = exports.GoTQueryThoughtStepSchema = exports.GoTQueryInputSchema = exports.MCPASRGoTQueryResultSchema = exports.GraphStateSchema = exports.GraphHyperedgeSchema = exports.GraphEdgeSchema = exports.GraphNodeSchema = exports.MCPASRGoTQueryParamsSchema = exports.MCPQueryOperationalParamsSchema = exports.MCPQueryContextSchema = exports.MCPInitializeResultSchema = exports.MCPInitializeParamsSchema = exports.MCPInitializeClientInfoSchema = exports.JSONRPCResponseSchema = exports.JSONRPCErrorObjectSchema = exports.JSONRPCRequestSchema = exports.NLQPayloadSchema = void 0;
exports.createJsonRpcError = createJsonRpcError;
const zod_1 = require("zod");
// --- Generic JSON-RPC Models ---
exports.NLQPayloadSchema = zod_1.z.object({
    question: zod_1.z.string().max(2000).transform(v => v.replace(/\r/g, ' ').replace(/\n/g, ' ').trim().replace(/\s+/g, ' ')),
});
exports.JSONRPCRequestSchema = zod_1.z.object({
    jsonrpc: zod_1.z.literal("2.0").default("2.0"),
    method: zod_1.z.string(),
    params: zod_1.z.any().optional(),
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()]).optional(),
});
exports.JSONRPCErrorObjectSchema = zod_1.z.object({
    code: zod_1.z.number().int(),
    message: zod_1.z.string(),
    data: zod_1.z.any().optional(),
});
exports.JSONRPCResponseSchema = zod_1.z.object({
    jsonrpc: zod_1.z.literal("2.0").default("2.0"),
    result: zod_1.z.any().optional(),
    error: exports.JSONRPCErrorObjectSchema.optional(),
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()]),
}).superRefine((val, ctx) => {
    if (val.result !== undefined && val.error !== undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Both "result" and "error" cannot be present in a JSONRPCResponse',
            path: ['result', 'error'],
        });
    }
    if (val.result === undefined && val.error === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Either "result" or "error" must be present in a JSONRPCResponse',
            path: ['result', 'error'],
        });
    }
});
// --- MCP Specific Schemas ---
exports.MCPInitializeClientInfoSchema = zod_1.z.object({
    client_name: zod_1.z.string().optional(),
    client_version: zod_1.z.string().optional(),
    supported_mcp_versions: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.MCPInitializeParamsSchema = zod_1.z.object({
    process_id: zod_1.z.number().int().optional(),
    client_info: exports.MCPInitializeClientInfoSchema.default({}),
});
exports.MCPInitializeResultSchema = zod_1.z.object({
    server_name: zod_1.z.string().default("Adaptive Graph of Thoughts-MCP"),
    server_version: zod_1.z.string().default("0.1.0"),
    mcp_version: zod_1.z.string().default("0.1.0"),
});
exports.MCPQueryContextSchema = zod_1.z.object({
    conversation_id: zod_1.z.string().optional(),
    history: zod_1.z.array(zod_1.z.record(zod_1.z.any())).optional(),
    user_preferences: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.MCPQueryOperationalParamsSchema = zod_1.z.object({
    include_reasoning_trace: zod_1.z.boolean().default(true),
    include_graph_state: zod_1.z.boolean().default(true),
    max_nodes_in_response_graph: zod_1.z.number().int().min(0).optional().default(50),
    output_detail_level: zod_1.z.enum(["summary", "detailed"]).optional().default("summary"),
});
exports.MCPASRGoTQueryParamsSchema = zod_1.z.object({
    query: zod_1.z.string(),
    context: exports.MCPQueryContextSchema.default({}),
    parameters: exports.MCPQueryOperationalParamsSchema.default({}),
    session_id: zod_1.z.string().optional(),
});
exports.GraphNodeSchema = zod_1.z.object({
    node_id: zod_1.z.string(),
    label: zod_1.z.string(),
    type: zod_1.z.string(),
    confidence: zod_1.z.array(zod_1.z.number()).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
exports.GraphEdgeSchema = zod_1.z.object({
    edge_id: zod_1.z.string(),
    source: zod_1.z.string(),
    target: zod_1.z.string(),
    edge_type: zod_1.z.string(),
    confidence: zod_1.z.number().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
exports.GraphHyperedgeSchema = zod_1.z.object({
    edge_id: zod_1.z.string(),
    nodes: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.number().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
exports.GraphStateSchema = zod_1.z.object({
    nodes: zod_1.z.array(exports.GraphNodeSchema).default([]),
    edges: zod_1.z.array(exports.GraphEdgeSchema).default([]),
    hyperedges: zod_1.z.array(exports.GraphHyperedgeSchema).default([]),
    layers: zod_1.z.record(zod_1.z.array(zod_1.z.string())).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
});
exports.MCPASRGoTQueryResultSchema = zod_1.z.object({
    answer: zod_1.z.string(),
    reasoning_trace_summary: zod_1.z.string().optional(),
    graph_state_full: exports.GraphStateSchema.optional(),
    confidence_vector: zod_1.z.array(zod_1.z.number()).optional(),
    execution_time_ms: zod_1.z.number().int().optional(),
    session_id: zod_1.z.string().optional(),
});
exports.GoTQueryInputSchema = zod_1.z.object({
    query: zod_1.z.string(),
    config_override: zod_1.z.record(zod_1.z.any()).optional(),
    session_id: zod_1.z.string().optional(),
});
exports.GoTQueryThoughtStepSchema = zod_1.z.object({
    stage_name: zod_1.z.string(),
    summary: zod_1.z.string(),
});
exports.GoTQueryProgressParamsSchema = zod_1.z.object({
    session_id: zod_1.z.string(),
    stage: zod_1.z.string(),
    status: zod_1.z.string(),
    message: zod_1.z.string().optional(),
    progress_percentage: zod_1.z.number().min(0.0).max(100.0).optional(),
    intermediate_results: zod_1.z.array(exports.GoTQueryThoughtStepSchema).optional(),
});
exports.GoTQueryProgressNotificationSchema = exports.JSONRPCRequestSchema.extend({
    method: zod_1.z.literal("got/queryProgress"),
    params: exports.GoTQueryProgressParamsSchema,
});
exports.GoTQueryFinalResultSchema = zod_1.z.object({
    session_id: zod_1.z.string(),
    final_answer: zod_1.z.string(),
    confidence_vector: zod_1.z.array(zod_1.z.number()).optional(),
    supporting_evidence_ids: zod_1.z.array(zod_1.z.string()).optional(),
    full_graph_summary: zod_1.z.record(zod_1.z.any()).optional(),
});
// --- Standard MCP Notification/Request structures ---
exports.SetTraceParamsSchema = zod_1.z.object({
    value: zod_1.z.enum(["off", "messages", "verbose"]),
});
exports.SetTraceNotificationSchema = exports.JSONRPCRequestSchema.extend({
    method: zod_1.z.literal("$/setTrace"),
    params: exports.SetTraceParamsSchema,
});
exports.LogTraceParamsSchema = zod_1.z.object({
    message: zod_1.z.string(),
    verbose: zod_1.z.string().optional(),
});
exports.LogTraceNotificationSchema = exports.JSONRPCRequestSchema.extend({
    method: zod_1.z.literal("$/logTrace"),
    params: exports.LogTraceParamsSchema,
});
// --- Shutdown and Exit ---
exports.ShutdownParamsSchema = zod_1.z.object({});
exports.ShutdownResultSchema = zod_1.z.object({});
exports.ExitParamsSchema = zod_1.z.object({});
function createJsonRpcError(requestId, code, message, data) {
    const errorObj = exports.JSONRPCErrorObjectSchema.parse({ code, message, data });
    return exports.JSONRPCResponseSchema.parse({ id: requestId, error: errorObj, result: undefined });
}
