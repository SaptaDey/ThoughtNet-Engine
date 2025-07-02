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
        var _a, _b;
        // Exa Search API URL
        this.baseUrl = ((_a = settings.exa_search) === null || _a === void 0 ? void 0 : _a.base_url) || 'https://api.exa.ai';
        this.apiKey = ((_b = settings.exa_search) === null || _b === void 0 ? void 0 : _b.api_key) || '';
        logger.info(`Exa Search client initialized${this.apiKey ? ' with API integration' : ' without API key (mock mode)'}`);
    }
    search(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, numResults = 10, type = "neural") {
            if (!query || query.trim().length === 0) {
                throw new ExaSearchClientError("Query cannot be empty");
            }
            if (numResults <= 0 || numResults > 100) {
                throw new ExaSearchClientError("Number of results must be between 1 and 100");
            }
            logger.info(`Searching Exa Search for: ${query} with num results: ${numResults}, type: ${type}`);
            try {
                if (this.apiKey) {
                    return yield this.searchWithExaAPI(query, numResults, type);
                }
                else {
                    logger.warn("Exa Search API key not configured. Using mock data for development.");
                    return this.getMockData(query, numResults);
                }
            }
            catch (error) {
                logger.error(`Error during Exa Search: ${error}`);
                // Fallback to mock data if API fails
                if (error instanceof ExaSearchClientError) {
                    logger.warn("Exa Search API failed, falling back to mock data");
                    return this.getMockData(query, numResults);
                }
                throw new ExaSearchClientError(`Failed to search Exa: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    searchWithExaAPI(query, numResults, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const searchUrl = `${this.baseUrl}/search`;
            const requestBody = {
                query: query,
                type: type, // "neural" or "keyword"
                numResults: numResults,
                includeDomains: ["arxiv.org", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com", "researchgate.net"],
                contents: {
                    text: {
                        includeHtmlTags: false,
                        maxCharacters: 1000
                    }
                }
            };
            const response = yield fetch(searchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'User-Agent': 'ThoughtNet-Engine/1.0'
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                throw new ExaSearchClientError(`Exa API request failed: ${response.status} ${response.statusText}`);
            }
            const data = yield response.json();
            if (data.error) {
                throw new ExaSearchClientError(`Exa API error: ${data.error}`);
            }
            const results = [];
            const searchResults = data.results || [];
            for (const result of searchResults) {
                const highlights = result.text ? [result.text.substring(0, 200) + '...'] : [];
                const article = new ExaArticleResult(result.title || 'No title', result.url || '', highlights, result.author || 'Unknown Author', result.publishedDate || '', result.score || 0.5);
                results.push(article);
            }
            logger.info(`Successfully retrieved ${results.length} Exa Search results`);
            return results;
        });
    }
    getMockData(query, numResults) {
        const mockCount = Math.min(numResults, 3);
        const results = [];
        for (let i = 1; i <= mockCount; i++) {
            results.push(new ExaArticleResult(`Neural Search Result on ${query} (${i})`, `https://research.example.com/article/${i}`, [`Advanced research on ${query} reveals significant insights...`, `Methodology includes comprehensive analysis of ${query}...`], `Dr. Neural ${String.fromCharCode(64 + i)}`, new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 0.85 + Math.random() * 0.14 // Score between 0.85-0.99
            ));
        }
        return results;
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info("Exa Search client closed.");
        });
    }
}
exports.ExaSearchClient = ExaSearchClient;
