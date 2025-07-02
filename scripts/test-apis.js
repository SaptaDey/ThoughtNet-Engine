#!/usr/bin/env node

/**
 * Manual API Integration Test Script
 * 
 * This script allows you to test the external API integrations manually
 * Run with: node scripts/test-apis.js
 */

const { PubMedClient } = require('../dist/infrastructure/apiClients/pubmedClient');
const { GoogleScholarClient } = require('../dist/infrastructure/apiClients/googleScholarClient');
const { ExaSearchClient } = require('../dist/infrastructure/apiClients/exaSearchClient');

// Load environment variables
require('dotenv').config();

const settings = {
  pubmed: {
    base_url: process.env.PUBMED_BASE_URL || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    api_key: process.env.PUBMED_API_KEY,
    email: process.env.PUBMED_EMAIL || 'test@thoughtnet.ai'
  },
  google_scholar: {
    base_url: process.env.GOOGLE_SCHOLAR_BASE_URL || 'https://serpapi.com/search',
    api_key: process.env.GOOGLE_SCHOLAR_API_KEY
  },
  exa_search: {
    base_url: process.env.EXA_BASE_URL || 'https://api.exa.ai',
    api_key: process.env.EXA_API_KEY
  }
};

async function testPubMed() {
  console.log('\n🧬 Testing PubMed Integration...');
  
  try {
    const client = new PubMedClient(settings);
    const results = await client.searchArticles('machine learning healthcare', 3);
    
    console.log(`✅ PubMed: Found ${results.length} articles`);
    if (results.length > 0) {
      console.log(`   First result: "${results[0].title.substring(0, 60)}..."`);
      console.log(`   DOI: ${results[0].doi || 'Not available'}`);
      console.log(`   Authors: ${results[0].authors?.join(', ') || 'Not available'}`);
    }
    
    await client.close();
  } catch (error) {
    console.log(`❌ PubMed Error: ${error.message}`);
  }
}

async function testGoogleScholar() {
  console.log('\n📚 Testing Google Scholar Integration...');
  
  try {
    const client = new GoogleScholarClient(settings);
    const results = await client.search('artificial intelligence ethics', 3);
    
    console.log(`✅ Google Scholar: Found ${results.length} articles`);
    if (results.length > 0) {
      console.log(`   First result: "${results[0].title.substring(0, 60)}..."`);
      console.log(`   Link: ${results[0].link || 'Not available'}`);
      console.log(`   Citations: ${results[0].cited_by_count || 0}`);
    }
    
    await client.close();
  } catch (error) {
    console.log(`❌ Google Scholar Error: ${error.message}`);
  }
}

async function testExaSearch() {
  console.log('\n🔍 Testing Exa Search Integration...');
  
  try {
    const client = new ExaSearchClient(settings);
    const results = await client.search('quantum computing breakthroughs', 3, 'neural');
    
    console.log(`✅ Exa Search: Found ${results.length} results`);
    if (results.length > 0) {
      console.log(`   First result: "${results[0].title?.substring(0, 60)}..."`);
      console.log(`   URL: ${results[0].url || 'Not available'}`);
      console.log(`   Score: ${results[0].score || 'Not available'}`);
    }
    
    await client.close();
  } catch (error) {
    console.log(`❌ Exa Search Error: ${error.message}`);
  }
}

async function main() {
  console.log('🧪 ThoughtNet-Engine API Integration Test');
  console.log('==========================================');
  
  // Check API configuration
  console.log('\n🔧 Configuration Status:');
  console.log(`   PubMed API Key: ${settings.pubmed.api_key ? '✅ Configured' : '⚠️  Not configured (will use free tier)'}`);
  console.log(`   PubMed Email: ${settings.pubmed.email ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Google Scholar API Key: ${settings.google_scholar.api_key ? '✅ Configured' : '⚠️  Not configured (will use mock data)'}`);
  console.log(`   Exa Search API Key: ${settings.exa_search.api_key ? '✅ Configured' : '⚠️  Not configured (will use mock data)'}`);
  
  // Run tests
  await testPubMed();
  await testGoogleScholar();
  await testExaSearch();
  
  console.log('\n🎉 API Integration Test Complete!');
  console.log('\n📖 For setup instructions, see: docs/API_INTEGRATION.md');
  console.log('💡 To configure APIs, add keys to your .env file');
}

// Run the test
main().catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
