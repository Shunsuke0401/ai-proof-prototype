/**
 * API route for mock ZK-proven deterministic summarization
 * Using mock implementation while RISC Zero setup is in progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { ErrorResponse } from '../../../api/types';
import { summarizeWithProvider, ProviderName } from '../../../api/providers';

interface ZKSummaryResponse {
  summary: string;
  programHash: string; // reuse previous naming for continuity (modelHash)
  inputHash: string;
  outputHash: string;
  zk: {
    proofCid: string;
    journalCid: string;
  };
  signer: string;
  timestamp: number;
  provider: ProviderName;
  model: string;
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
  const { text, signer, provider = 'mock', model } = body as { text: string; signer: string; provider?: ProviderName; model?: string };
    
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
      // Generate summary via selected provider (mock keeps deterministic behavior)
      let aiSummary;
      try {
        aiSummary = await summarizeWithProvider({ provider, text, model });
      } catch (provErr) {
        console.warn('Primary provider failed, falling back to mock:', provErr);
        aiSummary = await summarizeWithProvider({ provider: 'mock', text });
      }

      // Maintain previous mock hashing fields (map modelHash -> programHash etc.)
      const mockResult = generateMockSummary(text); // keep keyword extraction & proof placeholders

      // Upload mock proof and journal to IPFS
      const proofFormData = new FormData();
  const proofBytes = mockResult.proof instanceof Buffer ? new Uint8Array(mockResult.proof) : mockResult.proof;
  proofFormData.append('file', new Blob([proofBytes], { type: 'application/octet-stream' }), 'proof.bin');
      
      const journalFormData = new FormData();
      journalFormData.append('file', new Blob([mockResult.journal], { type: 'application/json' }), 'journal.json');
      
      const [proofUpload, journalUpload] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/ipfs-upload`, {
          method: 'POST',
          body: proofFormData
        }).catch(e => e),
        fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/ipfs-upload`, {
          method: 'POST',
          body: journalFormData
        }).catch(e => e)
      ]);

      let proofCid = 'ipfs_unavailable_proof';
      let journalCid = 'ipfs_unavailable_journal';

      if (proofUpload instanceof Response && proofUpload.ok) {
        try {
          const pr = await proofUpload.json();
          proofCid = pr.cid || proofCid;
        } catch {/* ignore parse error */}
      } else {
        console.warn('Proof upload failed or IPFS unavailable');
      }
      if (journalUpload instanceof Response && journalUpload.ok) {
        try {
          const jr = await journalUpload.json();
          journalCid = jr.cid || journalCid;
        } catch {/* ignore parse error */}
      } else {
        console.warn('Journal upload failed or IPFS unavailable');
      }
      
      const result: ZKSummaryResponse = {
        summary: aiSummary.summary || mockResult.summary,
        programHash: aiSummary.modelHash || mockResult.programHash,
        inputHash: mockResult.inputHash,
        outputHash: mockResult.outputHash,
        zk: {
          proofCid,
          journalCid
        },
        signer,
        timestamp: Date.now(),
        provider: provider,
        model: aiSummary.model
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