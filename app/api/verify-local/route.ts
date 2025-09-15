import { NextRequest, NextResponse } from 'next/server';
import { getJson, getFile } from '../../../api/ipfs';
import { verifyTypedData } from 'viem';

export async function POST(request: NextRequest) {
  try {
    const { signedProvenanceCid, includeContent } = await request.json();
    
    if (!signedProvenanceCid) {
      return NextResponse.json({ error: 'signedProvenanceCid is required' }, { status: 400 });
    }

    console.log(`🔍 Local verification for CID: ${signedProvenanceCid}`);
    
    // Try to retrieve the signed provenance data from mock IPFS
    let signedProvenance;
    try {
      signedProvenance = await getJson(signedProvenanceCid);
      console.log('✅ Successfully retrieved signed provenance data');
    } catch (error) {
      console.error('❌ Failed to retrieve signed provenance:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve signed provenance data',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 404 });
    }

    // Verify the structure
    if (!signedProvenance.signature || !signedProvenance.domain || !signedProvenance.types || !signedProvenance.provenance) {
      return NextResponse.json({
        success: false,
        error: 'Invalid signed provenance structure',
        details: 'Missing required fields: signature, domain, types, or provenance'
      }, { status: 400 });
    }

    // Verify the signature
    let signatureValid = false;
    let signatureError = null;
    try {
      // Skip signature verification for test signatures
      if (signedProvenance.signature.startsWith('0xtest_')) {
        signatureValid = true; // Accept test signatures for development
        console.log('🔐 Test signature detected - skipping verification');
      } else {
        signatureValid = await verifyTypedData({
          address: signedProvenance.signer as `0x${string}`,
          domain: signedProvenance.domain,
          types: signedProvenance.types,
          primaryType: 'ContentProvenance',
          message: signedProvenance.provenance,
          signature: signedProvenance.signature as `0x${string}`
        });
        console.log(`🔐 Signature verification: ${signatureValid ? 'VALID' : 'INVALID'}`);
      }
    } catch (error) {
      console.error('❌ Signature verification failed:', error);
      signatureError = error instanceof Error ? error.message : String(error);
      // Don't fail the entire verification for signature issues in development
    }

    // Try to retrieve content if contentCid is available
    let contentVerified = false;
    let contentDetails = null;
    let outputContent = null;
    let originalPrompt = null;
    
    if (signedProvenance.provenance.contentCid) {
      try {
        // Try to get content as raw data first
        const contentData = await getFile(signedProvenance.provenance.contentCid);
        const contentText = new TextDecoder().decode(contentData);
        
        contentVerified = true;
        contentDetails = {
          contentCid: signedProvenance.provenance.contentCid,
          contentLength: contentText.length,
          contentType: 'text',
          preview: contentText.substring(0, 100) + (contentText.length > 100 ? '...' : '')
        };
        
        // If includeContent is true, return the full content
        if (includeContent) {
          outputContent = contentText;
        }
        
        console.log('✅ Content successfully retrieved and verified');
      } catch (error) {
        console.warn('⚠️ Content retrieval failed:', error);
        contentDetails = {
          contentCid: signedProvenance.provenance.contentCid,
          error: 'Content not accessible'
        };
      }
    }
    
    // Try to retrieve original prompt if promptCid is available
    if (includeContent && signedProvenance.promptCid) {
      try {
        const promptData = await getFile(signedProvenance.promptCid);
        originalPrompt = new TextDecoder().decode(promptData);
        console.log('✅ Original prompt successfully retrieved');
      } catch (error) {
        console.warn('⚠️ Prompt retrieval failed:', error);
      }
    }

    return NextResponse.json({
      ok: true,
      issues: signatureValid ? [] : ['signature_invalid'],
      warnings: [],
      provenance: signedProvenance.provenance,
      signer: signedProvenance.signer,
      signature: signedProvenance.signature,
      outputContent,
      originalPrompt,
      success: true,
      signatureValid,
      contentVerified,
      signatureError,
      details: {
        signer: signedProvenance.signer,
        timestamp: signedProvenance.provenance.timestamp,
        modelId: signedProvenance.provenance.modelId,
        attestationStrategy: signedProvenance.provenance.attestationStrategy,
        programHash: signedProvenance.provenance.programHash,
        contentDetails
      },
      raw: signedProvenance
    });

  } catch (error) {
    console.error('❌ Local verification error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}