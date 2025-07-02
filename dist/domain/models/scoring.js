"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScoreResult = exports.ScoreResultSchema = void 0;
const zod_1 = require("zod");
exports.ScoreResultSchema = zod_1.z.object({
    score: zod_1.z.number().min(0).max(1).default(0.0),
    confidence_vector: zod_1.z.number().min(0).max(1).default(0.0),
    metrics: zod_1.z.string().default(''),
    details: zod_1.z.string().default(''),
    category_scores: zod_1.z.string().default(''),
});
const createScoreResult = (data) => {
    const parsed = exports.ScoreResultSchema.parse(data);
    return Object.assign(Object.assign({}, parsed), { get isHighConfidence() {
            return this.score > 0.7;
        } });
};
exports.createScoreResult = createScoreResult;
