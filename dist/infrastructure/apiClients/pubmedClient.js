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
        var _a, _b, _c;
        // PubMed E-utilities base URL
        this.baseUrl = ((_a = settings.pubmed) === null || _a === void 0 ? void 0 : _a.base_url) || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        this.apiKey = (_b = settings.pubmed) === null || _b === void 0 ? void 0 : _b.api_key;
        this.email = (_c = settings.pubmed) === null || _c === void 0 ? void 0 : _c.email;
        logger.info(`PubMed client initialized with base URL: ${this.baseUrl}`);
    }
    searchArticles(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, maxResults = 10) {
            var _a;
            if (!query || query.trim().length === 0) {
                throw new PubMedClientError("Query cannot be empty");
            }
            if (maxResults <= 0 || maxResults > 200) {
                throw new PubMedClientError("Max results must be between 1 and 200");
            }
            logger.info(`Searching PubMed for: ${query} with max results: ${maxResults}`);
            try {
                // Use real PubMed E-utilities API
                const searchUrl = `${this.baseUrl}/esearch.fcgi`;
                const searchParams = new URLSearchParams({
                    db: 'pubmed',
                    term: query,
                    retmax: maxResults.toString(),
                    retmode: 'json',
                    tool: 'ThoughtNet-Engine',
                    email: this.email || 'research@thoughtnet.ai'
                });
                if (this.apiKey) {
                    searchParams.append('api_key', this.apiKey);
                }
                const searchResponse = yield fetch(`${searchUrl}?${searchParams}`);
                if (!searchResponse.ok) {
                    throw new PubMedClientError(`PubMed search failed: ${searchResponse.status} ${searchResponse.statusText}`);
                }
                const searchData = yield searchResponse.json();
                const pmids = ((_a = searchData === null || searchData === void 0 ? void 0 : searchData.esearchresult) === null || _a === void 0 ? void 0 : _a.idlist) || [];
                if (pmids.length === 0) {
                    logger.info(`No results found for PubMed query: ${query}`);
                    return [];
                }
                // Fetch article details using efetch
                const fetchUrl = `${this.baseUrl}/efetch.fcgi`;
                const fetchParams = new URLSearchParams({
                    db: 'pubmed',
                    id: pmids.join(','),
                    retmode: 'xml',
                    rettype: 'abstract',
                    tool: 'ThoughtNet-Engine',
                    email: this.email || 'research@thoughtnet.ai'
                });
                if (this.apiKey) {
                    fetchParams.append('api_key', this.apiKey);
                }
                const fetchResponse = yield fetch(`${fetchUrl}?${fetchParams}`);
                if (!fetchResponse.ok) {
                    throw new PubMedClientError(`PubMed fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
                }
                const xmlText = yield fetchResponse.text();
                return this.parseXMLResponse(xmlText);
            }
            catch (error) {
                logger.error(`Error during PubMed search: ${error}`);
                // Fallback to mock data if API fails, but log the failure
                if (error instanceof PubMedClientError) {
                    logger.warn("PubMed API failed, falling back to mock data for development");
                    return this.getMockData(query, maxResults);
                }
                throw new PubMedClientError(`Failed to search PubMed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    parseXMLResponse(xmlText) {
        const articles = [];
        try {
            // Simple XML parsing for PubMed articles
            const articleMatches = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
            for (const articleXml of articleMatches) {
                const title = this.extractXMLContent(articleXml, 'ArticleTitle') || 'No title available';
                const abstractText = this.extractXMLContent(articleXml, 'AbstractText') || 'No abstract available';
                const pmid = this.extractXMLContent(articleXml, 'PMID') || '';
                // Extract authors
                const authorMatches = articleXml.match(/<Author[\s\S]*?<\/Author>/g) || [];
                const authors = authorMatches.map(authorXml => {
                    const lastName = this.extractXMLContent(authorXml, 'LastName') || '';
                    const foreName = this.extractXMLContent(authorXml, 'ForeName') || '';
                    return `${foreName} ${lastName}`.trim();
                }).filter(name => name.length > 0);
                // Extract publication date
                const pubDateMatch = articleXml.match(/<PubDate>[\s\S]*?<\/PubDate>/);
                let pubDate = '';
                if (pubDateMatch) {
                    const year = this.extractXMLContent(pubDateMatch[0], 'Year') || '';
                    const month = this.extractXMLContent(pubDateMatch[0], 'Month') || '';
                    const day = this.extractXMLContent(pubDateMatch[0], 'Day') || '';
                    pubDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                // Extract DOI if available
                const doiMatch = articleXml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
                const doi = doiMatch ? doiMatch[1] : undefined;
                const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '';
                articles.push(new PubMedArticle(title, abstractText, url, doi, authors, pubDate));
            }
            logger.info(`Successfully parsed ${articles.length} PubMed articles`);
            return articles;
        }
        catch (error) {
            logger.error(`Error parsing PubMed XML response: ${error}`);
            throw new PubMedClientError(`Failed to parse PubMed response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    extractXMLContent(xml, tagName) {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }
    getMockData(query, maxResults) {
        const mockCount = Math.min(maxResults, 2);
        const results = [];
        for (let i = 1; i <= mockCount; i++) {
            results.push(new PubMedArticle(`Research on ${query} - Study ${i}`, `Mock abstract discussing aspects of ${query} with scientific methodology and findings.`, `https://pubmed.ncbi.nlm.nih.gov/mock/${i}`, `10.1000/mock${i}`, [`Researcher ${String.fromCharCode(64 + i)}`, `Co-Author ${String.fromCharCode(67 + i)}`], new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]));
        }
        return results;
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info("PubMed client closed.");
        });
    }
}
exports.PubMedClient = PubMedClient;
