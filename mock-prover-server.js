#!/usr/bin/env node

// Simple mock prover server for testing ZK integration
const http = require('http');
const crypto = require('crypto');

const PORT = 4000;

// Mock image ID that matches what the app expects
const MOCK_IMAGE_ID = 'default_image_id';

// Generate a realistic mock journal
function generateMockJournal(input, imageId, modelFingerprint) {
  // Add '0x' prefix to match expected format in summarize API
  const inputHash = '0x' + crypto.createHash('sha256').update(input).digest('hex');
  
  // Generate mock output that matches what the summarize API expects
  const mockOutput = {
    keywords: ['mock', 'zk', 'proof'],
    summary: `Mock summary of: ${input.substring(0, 50)}...`,
    confidence: 0.95
  };
  
  // Calculate output hash the same way as summarize API: sha256(JSON.stringify(output))
  const outputHash = '0x' + crypto.createHash('sha256').update(JSON.stringify(mockOutput)).digest('hex');
  
  // Generate proper 32-byte hex hash for programHash (required for EIP-712 signing)
  const programHash = '0x' + crypto.createHash('sha256').update(imageId).digest('hex');
  
  return {
    programHash: programHash,  // Proper 32-byte hex hash for MetaMask compatibility
    input_hash: inputHash,  // Use snake_case to match parser expectation
    output_hash: outputHash,
    model_fingerprint: modelFingerprint || 'mock_model_fingerprint',
    keywords: mockOutput.keywords,
    timestamp: new Date().toISOString(),
    signer: 'mock_prover',
    output: mockOutput  // Include the actual output for response
  };
}

// Generate mock proof binary data with embedded journal
function generateMockProof(journal) {
  // Create a mock receipt that contains the journal as JSON
  // This simulates how RISC Zero embeds journal data in receipts
  const journalJson = JSON.stringify(journal);
  const journalBuffer = Buffer.from(journalJson, 'utf8');
  
  // Generate some random padding to simulate a real receipt structure
  const padding = crypto.randomBytes(512);
  
  // Combine journal and padding to create a mock receipt
  return Buffer.concat([journalBuffer, padding]);
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' && req.url === '/prove') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        console.log(`[mock-prover] Received prove request:`, {
          image_id: request.image_id,
          input_length: request.input?.length || 0
        });
        
        // Simulate processing time
        setTimeout(() => {
          const journal = generateMockJournal(request.input || '', request.image_id, request.model_fingerprint);
        const proof = generateMockProof(journal);
          
          const response = {
            ok: true,
            output: journal.output,  // Return the actual output object
            receipt: proof.toString('base64'),
            image_id: request.image_id,
            processing_time_ms: 2000 + Math.random() * 1000
          };
          
          console.log(`[mock-prover] Sending response:`, {
            ok: response.ok,
            output_size: JSON.stringify(response.output).length,
            receipt_size: response.receipt.length,
            processing_time: response.processing_time_ms
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        }, 2000); // 2 second delay to simulate real proving
        
      } catch (error) {
        console.error(`[mock-prover] Error processing request:`, error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          ok: false, 
          error: 'Invalid request format' 
        }));
      }
    });
    
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      service: 'mock-prover',
      version: '1.0.0',
      uptime: process.uptime()
    }));
    
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Mock ZK Prover Server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /prove - Generate mock ZK proof`);
  console.log(`   GET /health - Health check`);
  console.log(``);
  console.log(`💡 This is a mock server for testing ZK integration.`);
  console.log(`   It generates realistic mock proofs for development.`);
  console.log(``);
  console.log(`🔧 To stop: Ctrl+C`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down mock prover server...');
  server.close(() => {
    console.log('✅ Mock prover server stopped');
    process.exit(0);
  });
});