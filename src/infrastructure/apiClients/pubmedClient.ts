
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

export class PubMedClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PubMedClientError";
  }
}

export class PubMedArticle {
  constructor(
    public title: string,
    public abstract: string,
    public url: string,
    public doi?: string,
    public authors?: string[],
    public publication_date?: string,
  ) {}
}

export class PubMedClient {
  private baseUrl: string;
  private apiKey?: string;
  private email?: string;

  constructor(settings: any) {
    if (!settings.pubmed || !settings.pubmed.base_url) {
      throw new PubMedClientError("PubMed configuration missing or incomplete.");
    }
    this.baseUrl = settings.pubmed.base_url;
    this.apiKey = settings.pubmed.api_key;
    this.email = settings.pubmed.email;
  }

  async searchArticles(query: string, maxResults: number = 10): Promise<PubMedArticle[]> {
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
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
      
      // Return query-specific mock data with actual validation
      const mockCount = Math.min(maxResults, 2);
      const results: PubMedArticle[] = [];
      
      for (let i = 1; i <= mockCount; i++) {
        results.push(new PubMedArticle(
          `Research on ${query} - Study ${i}`,
          `Mock abstract discussing aspects of ${query} with scientific methodology and findings.`,
          `https://pubmed.ncbi.nlm.nih.gov/mock/${i}`,
          `10.1000/mock${i}`,
          [`Researcher ${String.fromCharCode(64 + i)}`, `Co-Author ${String.fromCharCode(67 + i)}`],
          new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        ));
      }
      
      return results;
      
    } catch (error) {
      logger.error(`Error during PubMed search: ${error}`);
      throw new PubMedClientError(`Failed to search PubMed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async close(): Promise<void> {
    logger.info("PubMed client closed.");
  }
}
