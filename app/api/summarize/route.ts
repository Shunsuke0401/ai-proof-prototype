/**
 * API route for mock ZK-proven deterministic summarization
 * Using mock implementation while RISC Zero setup is in progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponse } from '../../../api/types';

interface ZKSummaryResponse {
  summary: string;
  programHash: string;
  inputHash: string;
  outputHash: string;
  zk: {
    proofCid: string;
    journalCid: string;
  };
  signer: string;
  timestamp: number;
}

// Mock ZK implementation for testing
function generateMockSummary(text: string) {
  // Simple keyword extraction for testing
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const wordCount = words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const keywords = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));
    
  return {
    summary: `Key topics: ${keywords.map(k => k.word).join(', ')}`,
    keywords,
    programHash: 'mock_program_hash_' + Date.now(),
    inputHash: 'mock_input_hash_' + Date.now(),
    outputHash: 'mock_output_hash_' + Date.now(),
    proof: Buffer.from('mock_proof_data'),
    journal: JSON.stringify({ keywords, programHash: 'mock_program_hash', inputHash: 'mock_input_hash', outputHash: 'mock_output_hash' })
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, signer } = body;
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' } as ErrorResponse,
        { status: 400 }
      );
    }
    
    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text is too long (max 10,000 characters)' } as ErrorResponse,
        { status: 400 }
      );
    }

    if (!signer || typeof signer !== 'string') {
      return NextResponse.json(
        { error: 'Signer address is required' } as ErrorResponse,
        { status: 400 }
      );
    }
    
    try {
      // Generate mock summary and proof
      const mockResult = generateMockSummary(text);

      // Upload mock proof and journal to IPFS
      const proofFormData = new FormData();
      proofFormData.append('file', new Blob([mockResult.proof], { type: 'application/octet-stream' }), 'proof.bin');
      
      const journalFormData = new FormData();
      journalFormData.append('file', new Blob([mockResult.journal], { type: 'application/json' }), 'journal.json');
      
      const [proofUpload, journalUpload] = await Promise.all([
        fetch('http://localhost:3000/api/ipfs-upload', {
          method: 'POST',
          body: proofFormData
        }),
        fetch('http://localhost:3000/api/ipfs-upload', {
          method: 'POST',
          body: journalFormData
        })
      ]);
      
      if (!proofUpload.ok || !journalUpload.ok) {
        throw new Error('Failed to upload ZK artifacts to IPFS');
      }
      
      const proofResult = await proofUpload.json();
      const journalResult = await journalUpload.json();
      
      const result: ZKSummaryResponse = {
        summary: mockResult.summary,
        programHash: mockResult.programHash,
        inputHash: mockResult.inputHash,
        outputHash: mockResult.outputHash,
        zk: {
          proofCid: proofResult.cid,
          journalCid: journalResult.cid
        },
        signer,
        timestamp: Date.now()
      };
      
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Mock ZK processing error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('ZK Summarization error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to generate ZK summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      } as ErrorResponse,
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to submit text for summarization.' } as ErrorResponse,
    { status: 405 }
  );
}