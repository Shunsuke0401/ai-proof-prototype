// Test script to simulate the complete publish flow
const fetch = require('node-fetch');

async function testPublishFlow() {
  console.log('Testing complete publish flow...');
  
  try {
    // Step 1: Generate summary with ZK proof
    console.log('\n1. Generating summary...');
    const summarizeRes = await fetch('http://localhost:3000/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This is a test of the ZK proof system with corrected hash calculations.',
        signer: 'demo_user',
        provider: 'mock',
        useZk: true,
        params: { temperature: 0, top_p: 1 }
      })
    });
    
    if (!summarizeRes.ok) {
      throw new Error(`Summarize failed: ${summarizeRes.status}`);
    }
    
    const summarizeData = await summarizeRes.json();
    console.log('Summary generated successfully');
    console.log('Provenance:', JSON.stringify(summarizeData.provenance, null, 2));
    
    // Step 2: Test publish endpoint
    console.log('\n2. Testing publish...');
    const publishRes = await fetch('http://localhost:3000/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provenance: summarizeData.provenance,
        signature: '0xtest_signature_123',
        signer: 'demo_user',
        promptCid: summarizeData.promptCid
      })
    });
    
    if (!publishRes.ok) {
      const errorText = await publishRes.text();
      throw new Error(`Publish failed: ${publishRes.status} - ${errorText}`);
    }
    
    const publishData = await publishRes.json();
    console.log('Publish successful!');
    console.log('Response:', JSON.stringify(publishData, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testPublishFlow();