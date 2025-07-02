
import { settings } from '../../config';
import winston from 'winston';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export class ExaSearchClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExaSearchClientError";
  }
}

export class ExaArticleResult {
  constructor(
    public title?: string,
    public url?: string,
    public highlights?: string[],
    public author?: string,
    public published_date?: string,
    public score?: number,
  ) {}
}

export class ExaSearchClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(settings: any) {
    // Exa Search API URL
    this.baseUrl = settings.exa_search?.base_url || 'https://api.exa.ai';
    this.apiKey = settings.exa_search?.api_key || '';
    
    logger.info(`Exa Search client initialized${this.apiKey ? ' with API integration' : ' without API key (mock mode)'}`);
  }

  async search(query: string, numResults: number = 10, type: string = "neural"): Promise<ExaArticleResult[]> {
    if (!query || query.trim().length === 0) {
      throw new ExaSearchClientError("Query cannot be empty");
    }
    
    if (numResults <= 0 || numResults > 100) {
      throw new ExaSearchClientError("Number of results must be between 1 and 100");
    }

    logger.info(`Searching Exa Search for: ${query} with num results: ${numResults}, type: ${type}`);
    
    try {
      if (this.apiKey) {
        return await this.searchWithExaAPI(query, numResults, type);
      } else {
        logger.warn("Exa Search API key not configured. Using mock data for development.");
        return this.getMockData(query, numResults);
      }
      
    } catch (error) {
      logger.error(`Error during Exa Search: ${error}`);
      
      // Fallback to mock data if API fails
      if (error instanceof ExaSearchClientError) {
        logger.warn("Exa Search API failed, falling back to mock data");
        return this.getMockData(query, numResults);
      }
      
      throw new ExaSearchClientError(`Failed to search Exa: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async searchWithExaAPI(query: string, numResults: number, type: string): Promise<ExaArticleResult[]> {
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

    const response = await fetch(searchUrl, {
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

    const data = await response.json();
    
    if (data.error) {
      throw new ExaSearchClientError(`Exa API error: ${data.error}`);
    }

    const results: ExaArticleResult[] = [];
    const searchResults = data.results || [];

    for (const result of searchResults) {
      const highlights = result.text ? [result.text.substring(0, 200) + '...'] : [];
      
      const article = new ExaArticleResult(
        result.title || 'No title',
        result.url || '',
        highlights,
        result.author || 'Unknown Author',
        result.publishedDate || '',
        result.score || 0.5
      );
      results.push(article);
    }

    logger.info(`Successfully retrieved ${results.length} Exa Search results`);
    return results;
  }

  private getMockData(query: string, numResults: number): ExaArticleResult[] {
    const mockCount = Math.min(numResults, 3);
    const results: ExaArticleResult[] = [];
    
    for (let i = 1; i <= mockCount; i++) {
      results.push(new ExaArticleResult(
        `Neural Search Result on ${query} (${i})`,
        `https://research.example.com/article/${i}`,
        [`Advanced research on ${query} reveals significant insights...`, `Methodology includes comprehensive analysis of ${query}...`],
        `Dr. Neural ${String.fromCharCode(64 + i)}`,
        new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        0.85 + Math.random() * 0.14 // Score between 0.85-0.99
      ));
    }
    
    return results;
  }

  async close(): Promise<void> {
    logger.info("Exa Search client closed.");
  }
}
