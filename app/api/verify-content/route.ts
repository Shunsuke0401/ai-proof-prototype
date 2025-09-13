import { NextRequest, NextResponse } from 'next/server';
import { verifyContent } from '../../../api/verify';

export async function POST(request: NextRequest) {
  try {
  const { summaryCid, signatureCid, programHash } = await request.json();

    if (!summaryCid || !signatureCid) {
      return NextResponse.json(
        { error: 'Summary CID and Signature CID are required' },
        { status: 400 }
      );
    }

    // Validate CID format (support v0 Qm... base58 and v1 bafy... base32)
    const cidV0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/; // base58btc
    const cidV1 = /^bafy[1-9A-HJ-NP-Za-km-z]{30,}$/; // loose check
    if (!(cidV0.test(summaryCid) || cidV1.test(summaryCid)) || !(cidV0.test(signatureCid) || cidV1.test(signatureCid))) {
      return NextResponse.json(
        { error: 'Invalid CID format. Must be CIDv0 (Qm...) or CIDv1 (bafy...).' },
        { status: 400 }
      );
    }

    const result = await verifyContent({
      summaryCid: summaryCid.trim(),
      signatureCid: signatureCid.trim(),
      expectedProgramHash: programHash?.trim() || undefined,
      ipfsGateway: process.env.IPFS_GATEWAY
    });

    if (!result.success) {
      console.error('[verify-content] verification failed', { errors: result.errors, warnings: result.warnings, details: result.details, raw: result.raw });
      return NextResponse.json({
        error: 'Verification failed. One or more checks did not pass.',
        // Expose minimal diagnostic flags (no raw data leak)
        hasErrors: !!result.errors?.length,
        hasWarnings: !!result.warnings?.length
      }, { status: 400 });
    }

    if (result.warnings?.length) {
      console.warn('[verify-content] verification warnings', { warnings: result.warnings });
    }

    return NextResponse.json({
      success: true,
      message: 'Verification succeeded',
      details: result.details,
      hasWarnings: !!result.warnings?.length
    });

  } catch (error: any) {
    console.error('Verification error:', error);

    return NextResponse.json({ error: 'Internal server error during verification' }, { status: 500 });
  }
}