import { NextRequest, NextResponse } from 'next/server';
import { getJson, getFile } from '../../../api/ipfs';
import { ZERO_HASH } from '../../../api/types';

interface VerifyRequestBody { signedProvenanceCid: string; prompt?: string; }

interface VerificationReport {
  ok: boolean;
  signer?: string;
  modelId?: string;
  issues: string[];
  warnings: string[];
  hashes: {
    promptHash?: string;
    recomputedPromptHash?: string;
    outputHash?: string;
    recomputedOutputHash?: string;
    keywordsHash?: string;
    recomputedKeywordsHash?: string;
  };
  zk?: {
    mode?: string;
    journalCid?: string;
    proofCid?: string;
    proofVerified?: boolean;
  };
}

export async function POST(req: NextRequest) {
  const issues: string[] = [];
  const warnings: string[] = [];
  try {
    const body: VerifyRequestBody = await req.json();
    if (!body?.signedProvenanceCid) {
      return NextResponse.json({ error: 'Missing signedProvenanceCid' }, { status: 400 });
    }
    const signed = await getJson(body.signedProvenanceCid);
    if (!signed?.provenance) {
      return NextResponse.json({ error: 'Invalid signed provenance object' }, { status: 400 });
    }
    const prov = signed.provenance;
    const report: VerificationReport = {
      ok: true,
      signer: signed.signer,
      modelId: prov.modelId,
      issues,
      warnings,
      hashes: {
        promptHash: prov.promptHash,
        outputHash: prov.outputHash,
        keywordsHash: prov.keywordsHash !== ZERO_HASH ? prov.keywordsHash : undefined
      },
      zk: prov.attestationStrategy.startsWith('zk') ? {
        mode: prov.attestationStrategy,
        journalCid: prov.journalCid || undefined,
        proofCid: prov.proofCid || undefined,
        proofVerified: false // placeholder until real verification added
      } : undefined
    };

    // Recompute output hash from contentCid
    if (prov.contentCid) {
      try {
        const contentBytes = await getFile(prov.contentCid);
        const encoder = new TextDecoder();
        const contentText = encoder.decode(contentBytes);
        const recomputedOutputHash = sha256Hex(contentText);
        report.hashes.recomputedOutputHash = recomputedOutputHash;
        if (recomputedOutputHash.toLowerCase() !== prov.outputHash?.toLowerCase()) {
          issues.push('output_hash_mismatch');
          report.ok = false;
        }
      } catch (e) {
        issues.push('content_fetch_failed');
        report.ok = false;
      }
    } else {
      warnings.push('missing_content_cid');
    }

    // Recompute prompt hash if prompt provided
    if (body.prompt) {
      const recomputedPromptHash = sha256Hex(body.prompt);
      report.hashes.recomputedPromptHash = recomputedPromptHash;
      if (recomputedPromptHash.toLowerCase() !== prov.promptHash?.toLowerCase()) {
        issues.push('prompt_hash_mismatch');
        report.ok = false;
      }
    } else {
      warnings.push('prompt_not_supplied_for_hash_recompute');
    }

    // If zk keywords present, attempt to recompute from journal
    if (prov.journalCid && prov.keywordsHash && prov.keywordsHash !== ZERO_HASH) {
      try {
        const journal = await getJson(prov.journalCid);
        if (journal?.keywords) {
          const recomputedKeywordsHash = sha256Hex(JSON.stringify(journal.keywords));
          report.hashes.recomputedKeywordsHash = recomputedKeywordsHash;
          if (recomputedKeywordsHash.toLowerCase() !== prov.keywordsHash.toLowerCase()) {
            issues.push('keywords_hash_mismatch');
            report.ok = false;
          }
        } else {
          issues.push('journal_missing_keywords');
          report.ok = false;
        }
      } catch (e) {
        issues.push('journal_fetch_failed');
        report.ok = false;
      }
    }

    // Proof verification placeholder (future integration with RISC Zero receipt validation)
    if (report.zk && report.zk.proofCid) {
      warnings.push('proof_not_verified');
    }

    return NextResponse.json(report);
  } catch (e) {
    console.error('[verify-zk] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'POST signedProvenanceCid (and optional prompt) to verify.' });
}

function sha256Hex(data: string) {
  const bytes = new TextEncoder().encode(data);
  // using crypto subtle would require async; simple hash via built-in not available server-side without crypto module
  const cryptoMod = require('crypto');
  return '0x' + cryptoMod.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}