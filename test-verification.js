#!/usr/bin/env node

// Test script to generate content and verify it immediately
const fetch = require('node-fetch');

async function testVerification() {
  console.log('🧪 Testing content generation and verification...');
  
  try {
    // Step 1: Generate content through summarize API
    console.log('\n1. Generating content...');
    const summarizeRes = await fetch('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This is a test content for verification purposes.',
        useZk: false,
        provider: 'mock'
      })
    });
    
    if (!summarizeRes.ok) {
      const errorText = await summarizeRes.text();
      throw new Error(`Summarize failed: ${summarizeRes.status} - ${errorText}`);
    }
    
    const summarizeData = await summarizeRes.json();
    console.log('✅ Content generated successfully');
    console.log('Provenance keys:', Object.keys(summarizeData.provenance));
    
    // Step 2: Publish the content
    console.log('\n2. Publishing content...');
    const publishRes = await fetch('http://localhost:3000/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provenance: summarizeData.provenance,
        signature: '0xtest_signature_for_verification',
        signer: '0x742d35Cc6634C0532925a3b8D4C9db96590b5b8c',
        promptCid: summarizeData.promptCid
      })
    });
    
    if (!publishRes.ok) {
      const errorText = await publishRes.text();
      throw new Error(`Publish failed: ${publishRes.status} - ${errorText}`);
    }
    
    const publishData = await publishRes.json();
    console.log('✅ Content published successfully');
    console.log('Signed Provenance CID:', publishData.signedProvenanceCid);
    
    // Step 3: Verify the content using local verification
    console.log('\n3. Verifying content locally...');
    const verifyRes = await fetch('http://localhost:3000/api/verify-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedProvenanceCid: publishData.signedProvenanceCid
      })
    });
    
    if (!verifyRes.ok) {
      const errorText = await verifyRes.text();
      throw new Error(`Verification failed: ${verifyRes.status} - ${errorText}`);
    }
    
    const verifyData = await verifyRes.json();
    console.log('✅ Verification completed!');
    console.log('Verification result:', JSON.stringify(verifyData, null, 2));
    
    // Summary
    console.log('\n📋 VERIFICATION SUMMARY:');
    console.log(`✅ Content Generated: ${summarizeData.provenance.contentCid}`);
    console.log(`✅ Content Published: ${publishData.signedProvenanceCid}`);
    console.log(`✅ Signature Valid: ${verifyData.signatureValid}`);
    console.log(`✅ Content Verified: ${verifyData.contentVerified}`);
    console.log(`✅ Signer: ${verifyData.details.signer}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testVerification();