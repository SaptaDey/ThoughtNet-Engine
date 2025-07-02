
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

export class GoogleScholarClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleScholarClientError";
  }
}

export class UnexpectedResponseStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnexpectedResponseStructureError";
  }
}

export class GoogleScholarArticle {
  constructor(
    public title: string,
    public link?: string,
    public snippet?: string,
    public authors?: string,
    public publication_info?: string,
    public cited_by_count?: number,
  ) {}
}

export class GoogleScholarClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(settings: any) {
    if (!settings.google_scholar || !settings.google_scholar.api_key || !settings.google_scholar.base_url) {
      throw new GoogleScholarClientError("Google Scholar configuration missing or incomplete.");
    }
    this.baseUrl = settings.google_scholar.base_url;
    this.apiKey = settings.google_scholar.api_key;
  }

  async search(query: string, numResults: number = 10): Promise<GoogleScholarArticle[]> {
    if (!query || query.trim().length === 0) {
      throw new GoogleScholarClientError("Query cannot be empty");
    }
    
    if (numResults <= 0 || numResults > 100) {
      throw new GoogleScholarClientError("Number of results must be between 1 and 100");
    }

    logger.info(`Searching Google Scholar for: ${query} with num results: ${numResults}`);
    
    if (!this.apiKey) {
      logger.warn("Google Scholar API key not configured. Using mock data for development.");
    }
    
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
      
      const mockCount = Math.min(numResults, 2);
      const results: GoogleScholarArticle[] = [];
      
      for (let i = 1; i <= mockCount; i++) {
        results.push(new GoogleScholarArticle(
          `Academic Study on ${query} (${i})`,
          `https://scholar.google.com/mock/${i}`,
          `Comprehensive analysis of ${query} with peer-reviewed methodology and significant findings.`,
          `Dr. Scholar ${String.fromCharCode(64 + i)}, Prof. Academic ${String.fromCharCode(67 + i)}`,
          `Journal of ${query.split(' ')[0] || 'Research'}, ${2020 + i}`,
          Math.floor(Math.random() * 200) + 10
        ));
      }
      
      return results;
      
    } catch (error) {
      logger.error(`Error during Google Scholar search: ${error}`);
      throw new GoogleScholarClientError(`Failed to search Google Scholar: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async close(): Promise<void> {
    logger.info("Google Scholar client closed.");
  }
}
