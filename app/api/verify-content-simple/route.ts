import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { lookupByContentHash } from '../../../api/indexStore';
import { getJson, getFile } from '../../../api/ipfs';
import { verifyTypedData } from 'ethers';
import { domain as defaultDomain, types as defaultTypes, ZERO_HASH } from '../../../api/types';

interface SimpleVerifyBody { content: string; prompt?: string; }

/*
  High-level UX endpoint.
  Input: raw AI generated content text (and optional original prompt).
  Flow:
    1. Compute sha256(content) => outputHash.
    2. Use in-memory index to find candidate signedProvenanceCid(s).
    3. For each candidate, fetch envelope, compare signed outputHash.
    4. If match, optionally recompute prompt hash if prompt provided.
  Response (redacted): does NOT expose hashes unless mismatch. Focuses on
  authenticity booleans and signer address.
*/

export async function POST(req: NextRequest) {
  try {
    const body: SimpleVerifyBody = await req.json();
    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    const sha256Hex = (data: string) => '0x' + crypto.createHash('sha256').update(data, 'utf8').digest('hex');
    const outputHash = sha256Hex(body.content);
    const candidateCids = lookupByContentHash(outputHash) || [];
    if (candidateCids.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: 'no_provenance_found',
        message: 'No provenance record matches this content (hash not indexed).'
      });
    }

    // Evaluate candidates; pick first fully valid
    for (const cid of candidateCids) {
      try {
        const envelope = await getJson(cid);
        if (!envelope?.provenance) continue;
        const prov = envelope.provenance;
        if (prov.outputHash.toLowerCase() !== outputHash.toLowerCase()) continue; // false positive (should not happen unless collision)
        const signature: string | undefined = envelope.signature;
        let recovered: string | null = null;
        let signatureValid = false;
        if (signature) {
          try {
            recovered = verifyTypedData(envelope.domain || defaultDomain, envelope.types || defaultTypes, prov, signature);
            signatureValid = true;
          } catch {}
        }
        // Recompute prompt hash if prompt provided
        let promptMismatched = false;
        if (body.prompt) {
          const recomputedPrompt = sha256Hex(body.prompt);
          if (recomputedPrompt.toLowerCase() !== prov.promptHash.toLowerCase()) {
            promptMismatched = true;
          }
        }
        // If zk strategy present, note presence only (no deep proof verification here)
        const zkPresent = prov.attestationStrategy.startsWith('zk');
        const keywordsBound = zkPresent && prov.keywordsHash && prov.keywordsHash !== ZERO_HASH;

        return NextResponse.json({
          ok: signatureValid && !promptMismatched,
            status: signatureValid && !promptMismatched ? 'verified' : (promptMismatched ? 'prompt_mismatch' : 'invalid_signature'),
          signedProvenanceCid: cid,
          signer: envelope.signer || recovered,
          recoveredSigner: recovered,
          modelId: prov.modelId,
          attestation: prov.attestationStrategy,
          zkKeywordsIncluded: !!keywordsBound,
          timestamp: prov.timestamp,
          // Privacy: omit hashes by default
          details: {
            // Expose only if mismatched for debugging
            promptMismatch: promptMismatched || undefined,
            signatureMissing: !signature ? true : undefined,
            signerMismatch: (recovered && envelope.signer && recovered.toLowerCase() !== envelope.signer.toLowerCase()) || undefined
          }
        });
      } catch (e) {
        // continue to next candidate
      }
    }

    return NextResponse.json({ ok: false, reason: 'no_valid_candidate', message: 'Found candidate provenance records but none validated.' });
  } catch (e: any) {
    console.error('[verify-content-simple] error', e);
    return NextResponse.json({ error: 'internal_error', details: e?.message || 'unknown' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'POST { content, optional prompt } to verify provenance without hashes.' });
}
