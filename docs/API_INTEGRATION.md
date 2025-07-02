# External API Integration Guide

This document explains how to configure real external API integrations for the ThoughtNet-Engine evidence gathering system.

## Overview

The ThoughtNet-Engine uses three external APIs for evidence collection:

1. **PubMed** - For biomedical and life science literature
2. **Google Scholar** - For academic papers across all disciplines  
3. **Exa Search** - For neural search across the web

## Current Status

✅ **Real API Integration Implemented** - All three clients now support actual API calls
✅ **Graceful Fallback** - Falls back to mock data if APIs are unavailable
✅ **Proper Error Handling** - Handles API failures and rate limits
✅ **Configuration Flexibility** - Works with or without API keys

## API Configuration

### 1. PubMed (NCBI E-utilities)

**Free** - No API key required, but recommended for higher rate limits.

```bash
# .env configuration
PUBMED_BASE_URL=https://eutils.ncbi.nlm.nih.gov/entrez/eutils
PUBMED_API_KEY=your-ncbi-api-key  # Optional but recommended
PUBMED_EMAIL=your-email@domain.com  # Required for identification
```

**Setup Steps:**
1. Register at [NCBI](https://www.ncbi.nlm.nih.gov/account/) (optional)
2. Get API key from [NCBI settings](https://www.ncbi.nlm.nih.gov/account/settings/) (optional)
3. Set your email address (required by NCBI terms)

**Rate Limits:**
- Without API key: 3 requests/second
- With API key: 10 requests/second

### 2. Google Scholar (via SerpAPI)

**Paid** - Requires SerpAPI subscription for real data.

```bash
# .env configuration
GOOGLE_SCHOLAR_API_KEY=your-serpapi-key
GOOGLE_SCHOLAR_BASE_URL=https://serpapi.com/search
```

**Setup Steps:**
1. Sign up at [SerpAPI](https://serpapi.com)
2. Get API key from dashboard
3. Choose a pricing plan (100 free searches/month)

**Rate Limits:**
- Depends on your SerpAPI plan
- Typically 1-5 requests/second

**Alternative:** Without API key, uses enhanced mock data

### 3. Exa Search

**Paid** - Requires Exa API subscription for neural search.

```bash
# .env configuration
EXA_API_KEY=your-exa-api-key
EXA_BASE_URL=https://api.exa.ai
```

**Setup Steps:**
1. Sign up at [Exa](https://exa.ai)
2. Get API key from dashboard
3. Choose a pricing plan

**Rate Limits:**
- Depends on your Exa plan
- Typically 10-100 requests/minute

## Implementation Details

### Real API Features

#### PubMed Integration
- ✅ Real NCBI E-utilities API calls
- ✅ XML response parsing
- ✅ Author, abstract, and DOI extraction
- ✅ Proper rate limiting and retry logic
- ✅ Fallback to mock data on failures

#### Google Scholar Integration  
- ✅ SerpAPI integration for real Scholar data
- ✅ Title, snippet, and citation extraction
- ✅ Author and publication info parsing
- ✅ Fallback to enhanced mock data

#### Exa Search Integration
- ✅ Neural search API calls
- ✅ Domain filtering for academic sources
- ✅ Content extraction and highlighting
- ✅ Score-based relevance ranking
- ✅ Fallback to mock data

### Fallback Behavior

When APIs are not configured or fail:
1. **Graceful degradation** to mock data
2. **Logging** of failures for debugging
3. **Continued operation** without breaking the pipeline
4. **Realistic mock data** that maintains system functionality

### Error Handling

- **Network timeouts** - Automatic retry with exponential backoff
- **Rate limiting** - Respect API rate limits with delays
- **Invalid responses** - Parse errors gracefully handled
- **API quota exceeded** - Falls back to mock data
- **Authentication failures** - Clear error messages

## Testing APIs

### Test PubMed
```bash
# Test with a simple query
curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=cancer&retmax=5&retmode=json"
```

### Test SerpAPI (Google Scholar)
```bash
# Replace YOUR_API_KEY with actual key
curl "https://serpapi.com/search?engine=google_scholar&q=machine+learning&api_key=YOUR_API_KEY"
```

### Test Exa Search
```bash
# Replace YOUR_API_KEY with actual key
curl -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"query": "artificial intelligence", "numResults": 5}'
```

## Development vs Production

### Development Mode
- ✅ Works without any API keys
- ✅ Uses realistic mock data
- ✅ Simulates network delays
- ✅ Tests business logic effectively

### Production Mode
- ✅ Real API integrations for live data
- ✅ Enhanced evidence quality
- ✅ Access to latest research
- ✅ Proper rate limiting and error handling

## Cost Considerations

### Free Tier
- **PubMed**: Completely free (3 req/sec)
- **SerpAPI**: 100 searches/month free
- **Exa**: Limited free tier available

### Paid Tiers
- **PubMed**: Free with higher limits (API key)
- **SerpAPI**: $50-200/month for production use
- **Exa**: $20-100/month depending on usage

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for all secrets
3. **Rotate API keys** regularly
4. **Monitor API usage** for anomalies
5. **Set up rate limiting** to avoid overages

## Monitoring and Logging

The system logs:
- ✅ API call success/failure rates
- ✅ Response times and performance
- ✅ Rate limit status
- ✅ Fallback usage statistics
- ✅ Error messages and debugging info

## Troubleshooting

### Common Issues

1. **"API key not configured"**
   - Add API key to .env file
   - Restart the application

2. **"Rate limit exceeded"**
   - Check your API plan limits
   - Reduce request frequency

3. **"Invalid API response"**
   - Verify API endpoint URLs
   - Check API key validity

4. **"Network timeout"**
   - Check internet connectivity
   - Verify firewall settings

### Debug Mode

Enable debug logging for API calls:
```bash
LOG_LEVEL=debug
```

This will show detailed API request/response information.

## Next Steps

1. **Choose your APIs** based on research needs and budget
2. **Sign up** for required services
3. **Configure** .env file with API keys
4. **Test** the integration with real queries
5. **Monitor** usage and performance
6. **Scale** based on actual research volume

The system is now ready for production use with real external data sources!
