/**
 * API route for EIP-712 signature verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyTypedData } from 'viem';
import { domain, types, SaveProof } from '../../../api/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signature, value, signer } = body;
    
    if (!signature || !value || !signer) {
      return NextResponse.json(
        { error: 'Missing required fields: signature, value, signer' },
        { status: 400 }
      );
    }
    
    // Verify the EIP-712 signature
    const isValid = await verifyTypedData({
      address: signer as `0x${string}`,
      domain,
      types,
      primaryType: 'SaveProof',
      message: value as SaveProof,
      signature: signature as `0x${string}`,
    });
    
    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error('Signature verification error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to verify signature',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to verify signatures.' },
    { status: 405 }
  );
}