import { NextRequest, NextResponse } from 'next/server';
import { getJson, getFile } from '../../../api/ipfs';
import { ZERO_HASH, domain as defaultDomain, types as defaultTypes } from '../../../api/types';
import { verifyTypedData } from 'ethers';
import crypto from 'crypto';

/*
 Unified verification endpoint for new provenance objects.
 Required: signedProvenanceCid
 Optional: prompt (to recompute promptHash), journalCid, proofCid override (if wanting to test tampering), expectKeywords (boolean) to force presence.
*/

interface ReqBody {
  signedProvenanceCid: string;
  prompt?: string;           // optional prompt to recompute hash (for mismatch detection)
  journalCid?: string;       // allow override / tamper test
  proofCid?: string;         // allow override / tamper test
  expectKeywords?: boolean;  // require keywordsHash != ZERO
  includeContent?: boolean;  // if true, fetch content & include plaintext output + stored prompt (if promptCid present)
}

export async function POST(req: NextRequest) {
  try {
    const body: ReqBody = await req.json();
    if (!body.signedProvenanceCid) return NextResponse.json({ error: 'signedProvenanceCid required' }, { status: 400 });
    const envelope = await getJson(body.signedProvenanceCid);
  if (!envelope?.provenance) return NextResponse.json({ error: 'Invalid provenance envelope' }, { status: 400 });

  const prov = envelope.provenance;
  const signature: string | undefined = envelope.signature;
  const claimedSigner: string | undefined = envelope.signer;
    const issues: string[] = [];
    const warnings: string[] = [];

    // Basic structural sanity
    const must = ['promptHash','outputHash','paramsHash','contentCid'];
    for (const f of must) if (!prov[f]) { issues.push(`missing_${f}`); }

    // Hash helpers
    const sha256Hex = (data: string | Uint8Array) => {
      if (typeof data === 'string') {
        return '0x' + crypto.createHash('sha256').update(data, 'utf8').digest('hex');
      }
      return '0x' + crypto.createHash('sha256').update(data).digest('hex');
    };

  // We'll optionally recompute outputHash & promptHash (if we have promptCid or supplied prompt) when includeContent flag is set.

    // Prompt recomputation if provided
    if (body.prompt) {
      const recomputed = sha256Hex(body.prompt);
      if (recomputed.toLowerCase() !== (prov.promptHash || '').toLowerCase()) {
        issues.push('prompt_hash_mismatch');
      }
    } else {
      warnings.push('no_prompt_supplied');
    }

    // Keywords expectations
    if (body.expectKeywords && (!prov.keywordsHash || prov.keywordsHash === ZERO_HASH)) {
      issues.push('expected_keywords_missing');
    }

    // Allow override of journal/proof to test tampering scenarios
    const effectiveJournalCid = body.journalCid || prov.journalCid || '';
    const effectiveProofCid = body.proofCid || prov.proofCid || '';

    if (body.journalCid && body.journalCid !== prov.journalCid) warnings.push('journalCid_override_used');
    if (body.proofCid && body.proofCid !== prov.proofCid) warnings.push('proofCid_override_used');

    // Program hash presence (strength signal)
    const programHashBound = prov.programHash && prov.programHash !== ZERO_HASH;
    if (!programHashBound && prov.attestationStrategy.startsWith('zk')) warnings.push('program_hash_not_bound');

    // --- Signature recovery ---
    let recoveredSigner: string | null = null;
    if (!signature) {
      issues.push('missing_signature');
    } else {
      try {
        const dom = envelope.domain || defaultDomain;
        const tps = envelope.types || defaultTypes;
        recoveredSigner = verifyTypedData(dom, tps, prov, signature);
        if (claimedSigner && recoveredSigner.toLowerCase() !== claimedSigner.toLowerCase()) {
          issues.push('signature_recover_mismatch');
        }
      } catch (e) {
        issues.push('signature_invalid');
      }
    }

    let outputContent: string | undefined;
    let originalPrompt: string | undefined;
    let recomputedOutputHash: string | undefined;
    let recomputedPromptHash: string | undefined;
    let recomputedKeywordsHash: string | undefined;
    if (body.includeContent) {
      try {
        if (prov.contentCid) {
          const bytes = await getFile(prov.contentCid);
          outputContent = new TextDecoder().decode(bytes);
          // recompute output hash
          const cryptoMod = require('crypto');
          recomputedOutputHash = '0x' + cryptoMod.createHash('sha256').update(Buffer.from(outputContent,'utf8')).digest('hex');
          if (recomputedOutputHash.toLowerCase() !== prov.outputHash.toLowerCase()) {
            issues.push('output_hash_mismatch');
          }
        }
        if (envelope.promptCid) {
          const pbytes = await getFile(envelope.promptCid);
          originalPrompt = new TextDecoder().decode(pbytes);
          const cryptoMod = require('crypto');
          recomputedPromptHash = '0x' + cryptoMod.createHash('sha256').update(Buffer.from(originalPrompt,'utf8')).digest('hex');
          if (recomputedPromptHash.toLowerCase() !== prov.promptHash.toLowerCase()) {
            issues.push('stored_prompt_hash_mismatch');
          }
        }
        // If zk keywords present attempt to recompute from journal
        if (prov.journalCid && prov.keywordsHash && prov.keywordsHash !== ZERO_HASH) {
          try {
            const journal = await getJson(prov.journalCid);
            if (journal?.keywords) {
              const cryptoMod = require('crypto');
              recomputedKeywordsHash = '0x' + cryptoMod.createHash('sha256').update(Buffer.from(JSON.stringify(journal.keywords),'utf8')).digest('hex');
              if (recomputedKeywordsHash.toLowerCase() !== prov.keywordsHash.toLowerCase()) {
                issues.push('keywords_hash_mismatch');
              }
            } else {
              issues.push('journal_missing_keywords');
            }
          } catch (e) {
            issues.push('journal_fetch_failed');
          }
        } else if (prov.attestationStrategy.startsWith('zk') && (!prov.keywordsHash || prov.keywordsHash === ZERO_HASH)) {
          warnings.push('zk_keywords_not_bound');
        }
        // Proof present but we cannot verify yet
        if (prov.proofCid) warnings.push('proof_unverified');
      } catch (e) {
        warnings.push('content_fetch_failed');
      }
    }

    const ok = issues.length === 0;
    return NextResponse.json({
      ok,
      issues,
      warnings,
      provenance: {
        modelId: prov.modelId,
        attestationStrategy: prov.attestationStrategy,
        programHash: prov.programHash,
        keywordsHash: prov.keywordsHash !== ZERO_HASH ? prov.keywordsHash : null,
        journalCid: effectiveJournalCid || null,
        proofCid: effectiveProofCid || null,
        contentCid: prov.contentCid,
        outputHash: prov.outputHash,
        promptHash: prov.promptHash,
        paramsHash: prov.paramsHash,
        timestamp: prov.timestamp
      },
      signer: claimedSigner,
      recoveredSigner,
      signature,
      signatureDomain: envelope.domain?.name || 'AIProof',
      outputContent: outputContent && body.includeContent ? outputContent : undefined,
      originalPrompt: originalPrompt && body.includeContent ? originalPrompt : undefined,
      recomputed: body.includeContent ? {
        outputHash: recomputedOutputHash,
        promptHash: recomputedPromptHash,
        keywordsHash: recomputedKeywordsHash
      } : undefined
    });
  } catch (e: any) {
    console.error('[verify-provenance] error', e);
    return NextResponse.json({ error: 'Internal error', details: e?.message || 'unknown' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'POST signedProvenanceCid (optional: prompt, journalCid, proofCid) to verify high-level provenance.' });
}