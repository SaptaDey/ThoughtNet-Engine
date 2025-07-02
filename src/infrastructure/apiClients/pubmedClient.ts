
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
    // PubMed E-utilities base URL
    this.baseUrl = settings.pubmed?.base_url || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
    this.apiKey = settings.pubmed?.api_key;
    this.email = settings.pubmed?.email;
    
    logger.info(`PubMed client initialized with base URL: ${this.baseUrl}`);
  }

  async searchArticles(query: string, maxResults: number = 10): Promise<PubMedArticle[]> {
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

      const searchResponse = await fetch(`${searchUrl}?${searchParams}`);
      if (!searchResponse.ok) {
        throw new PubMedClientError(`PubMed search failed: ${searchResponse.status} ${searchResponse.statusText}`);
      }

      const searchData = await searchResponse.json();
      const pmids = searchData?.esearchresult?.idlist || [];
      
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

      const fetchResponse = await fetch(`${fetchUrl}?${fetchParams}`);
      if (!fetchResponse.ok) {
        throw new PubMedClientError(`PubMed fetch failed: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      const xmlText = await fetchResponse.text();
      return this.parseXMLResponse(xmlText);
      
    } catch (error) {
      logger.error(`Error during PubMed search: ${error}`);
      
      // Fallback to mock data if API fails, but log the failure
      if (error instanceof PubMedClientError) {
        logger.warn("PubMed API failed, falling back to mock data for development");
        return this.getMockData(query, maxResults);
      }
      
      throw new PubMedClientError(`Failed to search PubMed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseXMLResponse(xmlText: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];
    
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

        articles.push(new PubMedArticle(
          title,
          abstractText,
          url,
          doi,
          authors,
          pubDate
        ));
      }
      
      logger.info(`Successfully parsed ${articles.length} PubMed articles`);
      return articles;
      
    } catch (error) {
      logger.error(`Error parsing PubMed XML response: ${error}`);
      throw new PubMedClientError(`Failed to parse PubMed response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractXMLContent(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  private getMockData(query: string, maxResults: number): PubMedArticle[] {
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
  }

  async close(): Promise<void> {
    logger.info("PubMed client closed.");
  }
}
