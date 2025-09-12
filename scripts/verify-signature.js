#!/usr/bin/env node

/**
 * EIP-712 signature verification script
 * Usage: node verify-signature.js <summary.json> <signature.json>
 */

const fs = require('fs');
const { verifyTypedData } = require('viem');

// EIP-712 domain and types (must match the ones used in the app)
const domain = {
  name: "AIProof",
  version: "1",
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};

const types = {
  SaveProof: [
    { name: "cid", type: "string" },
    { name: "modelHash", type: "string" },
    { name: "timestamp", type: "string" },
  ],
};

async function verifySignature(summaryFile, signatureFile) {
  try {
    // Read files
    const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const signatureData = JSON.parse(fs.readFileSync(signatureFile, 'utf8'));
    
    console.log('📋 Verifying signature for:');
    console.log('   Signer:', signatureData.signer);
    console.log('   CID:', signatureData.value.cid);
    console.log('   Model Hash:', signatureData.value.modelHash);
    console.log('   Timestamp:', signatureData.value.timestamp);
    console.log('');
    
    // Verify that summary metadata matches signature data
    if (summaryData.signer !== signatureData.signer) {
      throw new Error('Signer mismatch between summary and signature');
    }
    
    if (summaryData.modelHash !== signatureData.value.modelHash) {
      throw new Error('Model hash mismatch between summary and signature');
    }
    
    if (summaryData.timestamp !== signatureData.value.timestamp) {
      throw new Error('Timestamp mismatch between summary and signature');
    }
    
    // Verify EIP-712 signature
    const isValid = await verifyTypedData({
      address: signatureData.signer,
      domain: signatureData.domain,
      types: signatureData.types,
      primaryType: 'SaveProof',
      message: signatureData.value,
      signature: signatureData.signature,
    });
    
    if (isValid) {
      console.log('✅ EIP-712 signature is valid!');
      console.log('✅ Metadata consistency verified!');
      return true;
    } else {
      console.log('❌ EIP-712 signature is invalid!');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.error('Usage: node verify-signature.js <summary.json> <signature.json>');
    process.exit(1);
  }
  
  const [summaryFile, signatureFile] = args;
  
  // Check if files exist
  if (!fs.existsSync(summaryFile)) {
    console.error(`❌ Summary file not found: ${summaryFile}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(signatureFile)) {
    console.error(`❌ Signature file not found: ${signatureFile}`);
    process.exit(1);
  }
  
  verifySignature(summaryFile, signatureFile)
    .then(isValid => {
      process.exit(isValid ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { verifySignature };