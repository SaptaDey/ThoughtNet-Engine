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
exports.ExaSearchClient = exports.ExaArticleResult = exports.ExaSearchClientError = void 0;
const config_1 = require("../../config");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class ExaSearchClientError extends Error {
    constructor(message) {
        super(message);
        this.name = "ExaSearchClientError";
    }
}
exports.ExaSearchClientError = ExaSearchClientError;
class ExaArticleResult {
    constructor(title, url, highlights, author, published_date, score) {
        this.title = title;
        this.url = url;
        this.highlights = highlights;
        this.author = author;
        this.published_date = published_date;
        this.score = score;
    }
}
exports.ExaArticleResult = ExaArticleResult;
class ExaSearchClient {
    constructor(settings) {
        if (!settings.exa_search || !settings.exa_search.api_key || !settings.exa_search.base_url) {
            throw new ExaSearchClientError("Exa Search configuration missing or incomplete.");
        }
        this.baseUrl = settings.exa_search.base_url;
        this.apiKey = settings.exa_search.api_key;
    }
    search(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, numResults = 10, type = "neural") {
            logger.info(`Searching Exa Search for: ${query} with num results: ${numResults}, type: ${type}`);
            // Placeholder for actual API call
            return [
                new ExaArticleResult("Mock Exa Result 1", "http://example.com/exa/1", ["Highlight 1", "Highlight 2"], "Exa Author A", "2024-01-01", 0.95),
                new ExaArticleResult("Mock Exa Result 2", "http://example.com/exa/2", ["Highlight 3"], "Exa Author B", "2024-02-01", 0.88),
            ];
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info("Exa Search client closed.");
        });
    }
}
exports.ExaSearchClient = ExaSearchClient;
