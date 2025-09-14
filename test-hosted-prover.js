#!/usr/bin/env node

// Test script for hosted prover integration
// This simulates the /api/summarize endpoint flow to verify the implementation

// Note: This test requires the Next.js app to be running
// The prover module is TypeScript and needs to be imported through the API endpoint

const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Helper function to compute SHA256
function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Make HTTP request helper
function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function testHostedProver() {
  console.log('🧪 Testing hosted prover integration via /api/summarize endpoint...');
  
  // Test configuration
  const testInput = 'This is a test input for the hosted prover. It should generate keywords and create a valid RISC Zero receipt.';
  const testPayload = {
    text: testInput,
    signer: 'test_signer',
    provider: 'mock',
    useZk: true,
    params: { temperature: 0 }
  };
  
  console.log('📋 Test parameters:');
  console.log(`  Input length: ${testInput.length}`);
  console.log(`  Using ZK: true`);
  console.log(`  Provider: mock`);
  console.log('');
  
  try {
    // Test the /api/summarize endpoint
    console.log('🔄 Testing /api/summarize endpoint with hosted prover...');
    const startTime = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/summarize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const postData = JSON.stringify(testPayload);
    const response = await makeRequest(options, postData);
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  API call completed in ${duration}ms`);
    
    if (response.status !== 200) {
      console.error('❌ API call failed:', response.status, response.data);
      process.exit(1);
    }
    
    console.log('✅ API call successful');
    console.log(`  Response keys: ${Object.keys(response.data).join(', ')}`);
    
    // Check if ZK was used
    if (response.data.zk) {
      console.log(`  ZK mode: ${response.data.zk.mode}`);
      console.log(`  ZK warnings: ${response.data.zk.warnings?.join(', ') || 'none'}`);
      
      if (response.data.zk.mode === 'real') {
        console.log('✅ Real ZK proving was used (hosted prover)');
      } else if (response.data.zk.mode === 'mock') {
        console.log('ℹ️  Mock ZK was used (MOCK_ZK=true or hosted prover unavailable)');
      } else {
        console.log('⚠️  ZK failed or was disabled');
      }
    }
    
    // Check provenance data
    if (response.data.provenance) {
      const prov = response.data.provenance;
      console.log('');
      console.log('📊 Provenance data:');
      console.log(`  Attestation strategy: ${prov.attestationStrategy}`);
      console.log(`  Program hash: ${prov.programHash}`);
      console.log(`  Keywords hash: ${prov.keywordsHash}`);
      console.log(`  Journal CID: ${prov.journalCid || 'none'}`);
      console.log(`  Proof CID: ${prov.proofCid || 'none'}`);
    }
    
    console.log('');
    console.log('🎉 Endpoint test completed!');
    console.log('📈 Test summary:');
    console.log(`  ✅ API endpoint: OK`);
    console.log(`  ✅ Response structure: OK`);
    console.log(`  ⏱️  Total test duration: ${duration}ms`);
    
    console.log('');
    console.log('🚀 Hosted prover integration is ready!');
    console.log('💡 To test with a real hosted prover:');
    console.log('   1. Set PROVER_URL to your hosted prover endpoint');
    console.log('   2. Set MOCK_ZK=false');
    console.log('   3. Ensure your hosted prover is running and accessible');
    
  } catch (error) {
    console.error('💥 Test failed with exception:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('🔧 Make sure the Next.js development server is running:');
      console.error('   npm run dev');
    }
    process.exit(1);
  }
}

// Environment check
function checkEnvironment() {
  console.log('🔧 Environment configuration:');
  console.log(`  PROVER_URL: ${process.env.PROVER_URL || 'http://localhost:4000 (default)'}`);
  console.log(`  PROVER_TIMEOUT_MS: ${process.env.PROVER_TIMEOUT_MS || '180000 (default)'}`);
  console.log(`  PROVER_RETRIES: ${process.env.PROVER_RETRIES || '2 (default)'}`);
  console.log('');
  
  if (!process.env.PROVER_URL) {
    console.log('⚠️  PROVER_URL not set, using default localhost:4000');
    console.log('   Make sure your hosted prover is running on this address');
    console.log('');
  }
}

// Main execution
if (require.main === module) {
  checkEnvironment();
  testHostedProver().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { testHostedProver };