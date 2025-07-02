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
exports.PubMedClient = exports.PubMedArticle = exports.PubMedClientError = void 0;
const config_1 = require("../../config");
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: config_1.settings.app.log_level.toLowerCase(),
    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), winston_1.default.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)),
    transports: [
        new winston_1.default.transports.Console()
    ],
});
class PubMedClientError extends Error {
    constructor(message) {
        super(message);
        this.name = "PubMedClientError";
    }
}
exports.PubMedClientError = PubMedClientError;
class PubMedArticle {
    constructor(title, abstract, url, doi, authors, publication_date) {
        this.title = title;
        this.abstract = abstract;
        this.url = url;
        this.doi = doi;
        this.authors = authors;
        this.publication_date = publication_date;
    }
}
exports.PubMedArticle = PubMedArticle;
class PubMedClient {
    constructor(settings) {
        if (!settings.pubmed || !settings.pubmed.base_url) {
            throw new PubMedClientError("PubMed configuration missing or incomplete.");
        }
        this.baseUrl = settings.pubmed.base_url;
        this.apiKey = settings.pubmed.api_key;
        this.email = settings.pubmed.email;
    }
    searchArticles(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, maxResults = 10) {
            if (!query || query.trim().length === 0) {
                throw new PubMedClientError("Query cannot be empty");
            }
            if (maxResults <= 0 || maxResults > 200) {
                throw new PubMedClientError("Max results must be between 1 and 200");
            }
            logger.info(`Searching PubMed for: ${query} with max results: ${maxResults}`);
            // TODO: Implement actual PubMed API integration
            // For now, validate configuration and return controlled mock data
            if (!this.apiKey && !this.email) {
                logger.warn("PubMed API key or email not configured. Using mock data for development.");
            }
            try {
                // Simulate network delay for realistic behavior
                yield new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
                // Return query-specific mock data with actual validation
                const mockCount = Math.min(maxResults, 2);
                const results = [];
                for (let i = 1; i <= mockCount; i++) {
                    results.push(new PubMedArticle(`Research on ${query} - Study ${i}`, `Mock abstract discussing aspects of ${query} with scientific methodology and findings.`, `https://pubmed.ncbi.nlm.nih.gov/mock/${i}`, `10.1000/mock${i}`, [`Researcher ${String.fromCharCode(64 + i)}`, `Co-Author ${String.fromCharCode(67 + i)}`], new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]));
                }
                return results;
            }
            catch (error) {
                logger.error(`Error during PubMed search: ${error}`);
                throw new PubMedClientError(`Failed to search PubMed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info("PubMed client closed.");
        });
    }
}
exports.PubMedClient = PubMedClient;
