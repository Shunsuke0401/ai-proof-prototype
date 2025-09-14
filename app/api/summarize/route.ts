import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { addFile } from '../../../api/ipfs';
import { domain, types, SaveProof, ErrorResponse } from '../../../api/types';

// Use local development path or Docker path based on environment
const ZK_HOST_BINARY = process.env.NODE_ENV === 'production' ? '/app/bin/zkhost' : './zk/target/release/zkhost';
const TEMP_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : './zk';

export async function POST(request: NextRequest) {
  try {
    const { text, signer } = await request.json();
    
    if (!text || !signer) {
      return NextResponse.json(
        { error: 'Text and signer are required' },
        { status: 400 }
      );
    }

    // Input size validation for real ZK proofs (2-4KB limit)
    const textSizeBytes = Buffer.byteLength(text, 'utf8');
    const maxSizeBytes = 4 * 1024; // 4KB
    const minSizeBytes = 10; // Minimum 10 bytes
    
    if (textSizeBytes > maxSizeBytes) {
      return NextResponse.json(
        { 
          error: `Input text too large: ${textSizeBytes} bytes. Maximum allowed: ${maxSizeBytes} bytes (4KB) for real ZK proof generation.`,
          inputSize: textSizeBytes,
          maxSize: maxSizeBytes
        },
        { status: 413 }
      );
    }
    
    if (textSizeBytes < minSizeBytes) {
      return NextResponse.json(
        { 
          error: `Input text too small: ${textSizeBytes} bytes. Minimum required: ${minSizeBytes} bytes.`,
          inputSize: textSizeBytes,
          minSize: minSizeBytes
        },
        { status: 400 }
      );
    }
    
    console.log(`📏 Input validation passed: ${textSizeBytes} bytes (${(textSizeBytes/1024).toFixed(2)}KB)`);

    const timestamp = new Date().toISOString();
    const sessionId = `zk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create temporary files
    const inputFile = join(TEMP_DIR, `${sessionId}_input.txt`);
    const journalFile = join(TEMP_DIR, `${sessionId}_journal.json`);
    const proofFile = join(TEMP_DIR, `${sessionId}_proof.bin`);
    
    try {
      // Write input text to temporary file
      await fs.writeFile(inputFile, text, 'utf8');
      
      // Generate ZK proof (with fallback to mock for development)
      console.log(`🔬 Running ZK proof generation for session ${sessionId}`);
      
      // Check if ZK generation should be mocked
      // Default to mock in development environment to avoid build issues
      const useMockZK = process.env.MOCK_ZK !== 'false' && process.env.NODE_ENV !== 'production';
      console.log(`🔧 Environment check: MOCK_ZK=${process.env.MOCK_ZK}, NODE_ENV=${process.env.NODE_ENV}, useMockZK=${useMockZK}`);
      
      let zkResult;
      if (useMockZK) {
        console.log('⚡ Using mock ZK proof for faster development');
        zkResult = await generateMockZKProof(inputFile, journalFile, proofFile, text);
      } else {
        console.log('🔄 Using real ZK proof generation');
        zkResult = await runZKHost(inputFile, journalFile, proofFile);
      }
      
      if (!zkResult.success) {
        throw new Error(`ZK proof generation failed: ${zkResult.error}`);
      }
      
      // Read generated files
      const [journalData, proofBytes] = await Promise.all([
        fs.readFile(journalFile, 'utf8').then(data => JSON.parse(data)),
        fs.readFile(proofFile)
      ]);
      
      console.log(`📊 Generated proof: ${proofBytes.length} bytes`);
      console.log(`📄 Journal data:`, journalData);
      
      // Validate proof size for real ZK proofs (should be hundreds of KB+)
      if (!useMockZK) {
        const minProofSize = 50 * 1024; // 50KB minimum for real proofs
        if (proofBytes.length < minProofSize) {
          console.error(`❌ Proof too small: ${proofBytes.length} bytes < ${minProofSize} bytes`);
          throw new Error(`Generated proof is too small (${proofBytes.length} bytes). Real ZK proofs should be at least ${minProofSize} bytes. This suggests the proof generation failed or is using dev mode.`);
        }
        console.log(`✅ Proof size validation passed: ${proofBytes.length} bytes (${(proofBytes.length/1024).toFixed(2)}KB)`);
      }
      
      // Upload journal and proof to IPFS
      const [journalCid, proofCid] = await Promise.all([
        addFile(Buffer.from(JSON.stringify(journalData))),
        addFile(proofBytes)
      ]);
      
      console.log(`📤 Uploaded to IPFS - Journal: ${journalCid}, Proof: ${proofCid}`);
      
      // Create summary metadata with ZK proof data
      const summaryData = {
        summary: generateSummaryText(journalData.keywords),
        keywords: journalData.keywords,
        programHash: journalData.programHash,
        inputHash: journalData.inputHash,
        outputHash: journalData.outputHash,
        model: 'risc0-zk-summarizer',
        modelHash: journalData.programHash,
        signer,
        timestamp,
        originalTextHash: journalData.inputHash,
        zk: {
          journalCid,
          proofCid
        }
      };

      // Upload summary to IPFS
      const summaryBuffer = Buffer.from(JSON.stringify(summaryData));
      const summaryCid = await addFile(summaryBuffer);

      // Create signature data structure (signature should be provided by client)
      const signatureValue: SaveProof = {
        cid: summaryCid,
        modelHash: journalData.programHash,
        timestamp
      };
      
      // Note: In a real implementation, the signature would be provided by the client wallet
      // For now, we create the structure without a valid signature
      const signatureData = {
        signature: '', // Empty - should be signed by client wallet in production
        domain,
        types,
        value: signatureValue,
        signer,
        timestamp
      };

      // Upload signature to IPFS
      const signatureBuffer = Buffer.from(JSON.stringify(signatureData));
      const signatureCid = await addFile(signatureBuffer);

      return NextResponse.json({
        success: true,
        summaryCid,
        signatureCid,
        summary: summaryData.summary,
        keywords: journalData.keywords,
        zkProof: {
          journalCid,
          proofCid,
          programHash: journalData.programHash
        }
      });

    } finally {
      // Clean up temporary files
      await Promise.allSettled([
        fs.unlink(inputFile).catch(() => {}),
        fs.unlink(journalFile).catch(() => {}),
        fs.unlink(proofFile).catch(() => {})
      ]);
    }

  } catch (error) {
    console.error('Error in summarize API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function runZKHost(inputFile: string, journalFile: string, proofFile: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = ['--in', inputFile, '--out', journalFile, '--proof', proofFile];
    const process = spawn(ZK_HOST_BINARY, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Set 3-minute timeout for real ZK proof generation
    const timeoutId = setTimeout(() => {
      console.log('⏰ ZK proof generation timeout, killing process...');
      process.kill('SIGTERM');
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
      resolve({ success: false, error: 'ZK proof generation timed out after 3 minutes' });
    }, 180000); // 3 minutes (180 seconds)
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('📝 ZK host output:', data.toString().trim());
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('⚠️ ZK host stderr:', data.toString().trim());
    });
    
    process.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        console.log(`✅ ZK host completed successfully:`, stdout);
        resolve({ success: true });
      } else {
        console.error(`❌ ZK host failed with code ${code}:`, stderr);
        resolve({ success: false, error: `Exit code ${code}: ${stderr}` });
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeoutId);
      console.error(`❌ ZK host spawn error:`, error);
      resolve({ success: false, error: error.message });
    });
  });
}

async function generateMockZKProof(inputFile: string, journalFile: string, proofFile: string, inputText: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate mock keywords from input text
    const words = inputText.toLowerCase().split(/\W+/).filter(word => word.length > 3);
    const wordCounts = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const keywords = Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Create mock journal data
    const journalData = {
      keywords,
      programHash: '0x' + Buffer.from('mock-program-hash').toString('hex'),
      inputHash: '0x' + Buffer.from(inputText).toString('hex').slice(0, 64),
      outputHash: '0x' + Buffer.from(JSON.stringify(keywords)).toString('hex').slice(0, 64)
    };
    
    // Write mock files
    await fs.writeFile(journalFile, JSON.stringify(journalData), 'utf8');
    await fs.writeFile(proofFile, Buffer.from('mock-zk-proof-data'));
    
    console.log('✅ Mock ZK proof generated successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Mock ZK proof generation failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function generateSummaryText(keywords: Array<{ word: string; count: number }>): string {
  if (keywords.length === 0) {
    return 'No significant keywords found.';
  }
  
  const topWords = keywords.slice(0, 3).map(k => k.word);
  return `Key topics: ${topWords.join(', ')} (${keywords.length} keywords total)`;
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to submit text for summarization.' } as ErrorResponse,
    { status: 405 }
  );
}