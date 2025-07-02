"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoTProcessorSessionDataSchema = void 0;
const zod_1 = require("zod");
exports.GoTProcessorSessionDataSchema = zod_1.z.object({
    session_id: zod_1.z.string().default(''),
    query: zod_1.z.string().default(''),
    final_answer: zod_1.z.string().default(''),
    final_confidence_vector: zod_1.z.string().default('0.5,0.5,0.5,0.5'), // Simplified as string
    accumulated_context: zod_1.z.record(zod_1.z.any()).default({}),
    stage_outputs_trace: zod_1.z.array(zod_1.z.record(zod_1.z.any())).default([]),
});
