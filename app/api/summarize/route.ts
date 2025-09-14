import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { summarizeWithProvider, ProviderName } from '../../../api/providers';
import { addFile } from '../../../api/ipfs';
import { domain, types, ZERO_HASH, ContentProvenanceValue, UnsignedProvenanceResponse } from '../../../api/types';

// Configurable paths (keep binary path; gate execution behind flags)
const ZK_HOST_BINARY = process.env.ZK_HOST_BINARY || (process.env.NODE_ENV === 'production' ? '/app/bin/zkhost' : './zk/target/release/zkhost');
const TEMP_DIR = process.env.ZK_TEMP_DIR || (process.env.NODE_ENV === 'production' ? '/tmp' : './zk');

// Legacy response type replaced by UnsignedProvenanceResponse

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

  const { text, signer = 'unknown', provider = 'mock', model, useZk = false, params }: { text: string; signer?: string; provider?: ProviderName; model?: string; useZk?: boolean; params?: Record<string, any> } = body;

    if (!text.trim()) return NextResponse.json({ error: 'Empty text' }, { status: 400 });
    if (!signer) return NextResponse.json({ error: 'Missing signer' }, { status: 400 });

    // Provider summary first (even if zk fails, we have something)
  let providerSummaryData: { summary: string; model: string; modelHash: string };
  const warnings: string[] = [];
    try {
      providerSummaryData = await summarizeWithProvider({ provider, text, model });
    } catch (e) {
      warnings.push('provider_failed_fallback_mock');
      providerSummaryData = await summarizeWithProvider({ provider: 'mock', text });
    }

  // Canonical param normalization (deterministic inference requirements)
  const canonicalParams = canonicalizeParams(params);
  const paramsHash = sha256Hex(JSON.stringify(canonicalParams));

  // promptHash == hash of the original text (prompt)
  const promptHash = sha256Hex(text);
  const providerOutput = providerSummaryData.summary;
  const outputHash = sha256Hex(providerOutput);

  // Defaults for zk fields
  let programHash = ZERO_HASH;      // will be real program/image hash or ZERO
  let keywordsHash = ZERO_HASH;     // hash over canonical keywords JSON
  let journalCid = '';
  let proofCid = '';
  let zkMode: 'disabled' | 'real' | 'mock' | 'failed' = 'disabled';

  if (useZk) {
      const zkEnabled = process.env.ZK_HOST_ENABLED === '1';
      const forceMock = process.env.MOCK_ZK === 'true' || !zkEnabled;
      if (forceMock) {
        zkMode = 'mock';
        const mock = await generateMockJournal(providerOutput);
        programHash = mock.programHash;
        keywordsHash = sha256Hex(JSON.stringify(mock.keywords));
        try {
          const [j, p] = await Promise.all([
            safeAddFile(Buffer.from(JSON.stringify(mock.journalData))),
            safeAddFile(Buffer.from('mock-proof'))
          ]);
          if (j) journalCid = j;
          if (p) proofCid = p;
        } catch {
          warnings.push('mock_zk_ipfs_failed');
        }
      } else {
        const real = await runRealZK(providerOutput).catch(e => { warnings.push('zk_exec_error'); return null; });
        if (real && real.success && real.journalData) {
          zkMode = 'real';
          const journal = real.journalData;
          const kws = journal.keywords || [];
          // Keywords in journal should already be canonical; compute hash same strategy as guest
          keywordsHash = sha256Hex(JSON.stringify(kws));
          programHash = journal.programHash && journal.programHash !== '<FILLED_BY_HOST>' ? toBytes32(programHashFromAny(journal.programHash)) : ZERO_HASH;
          try {
            const [j, p] = await Promise.all([
              safeAddFile(Buffer.from(JSON.stringify(journal))),
              safeAddFile(real.proofBytes || Buffer.from(''))
            ]);
            if (j) journalCid = j;
            if (p) proofCid = p;
          } catch {
            warnings.push('real_zk_ipfs_failed');
          }
        } else {
          zkMode = 'failed';
          warnings.push('zk_failed');
        }
      }
    }

    // Store raw provider content to IPFS (contentCid)
  const contentCid = await addFile(Uint8Array.from(Buffer.from(providerOutput)));
  // Store original prompt separately (not strictly required for verification but useful to reveal later)
  let promptCid: string | undefined;
  try { promptCid = await addFile(Uint8Array.from(Buffer.from(text))); } catch {}

    const provenance: ContentProvenanceValue = {
      version: 1,
      modelId: providerSummaryData.model,
      modelHash: providerSummaryData.modelHash || '',
      promptHash,
      outputHash,
      paramsHash,
      contentCid,
      timestamp: Date.now(),
      attestationStrategy: useZk ? (zkMode === 'real' ? 'zk-keywords' : zkMode === 'mock' ? 'zk-keywords-mock' : 'none') : 'none',
      keywordsHash,
      programHash: programHash === ZERO_HASH ? ZERO_HASH : programHash,
      journalCid: journalCid || '',
      proofCid: proofCid || ''
    };

    // Prune unused EIP-712 types to avoid ambiguity (we only sign ContentProvenance)
    const prunedTypes: any = { ContentProvenance: types.ContentProvenance };
    const unsigned: UnsignedProvenanceResponse = {
      provenance,
      domain,
      types: prunedTypes,
      primaryType: 'ContentProvenance',
      providerOutput,
      promptCid,
      zk: useZk ? { mode: zkMode, journalCid, proofCid, warnings } : undefined
    };

    return NextResponse.json(unsigned);
  } catch (e) {
    console.error('[summarize] error', e);
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'POST text to summarize. Optional: { useZk: true }' });
}

// ===== Helpers =====

function sha256Hex(data: string | Buffer | Uint8Array) {
  const buf: Buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  const bytes = Uint8Array.from(buf);
  return '0x' + crypto.createHash('sha256').update(bytes).digest('hex');
}

function generateSummaryText(keywords: Array<{ word: string; count: number }>): string {
  if (!keywords.length) return 'No significant keywords found.';
  return 'Key topics: ' + keywords.slice(0, 3).map(k => k.word).join(', ');
}

async function generateMockJournal(input: string) {
  const words = input.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const counts: Record<string, number> = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const keywords = Object.entries(counts).map(([word, count]) => ({ word, count })).sort((a,b)=>b.count-a.count).slice(0,10);
  const programHash = sha256Hex('mock_program_v1');
  const inputHash = sha256Hex(input);
  const outputHash = sha256Hex(JSON.stringify(keywords));
  const journalData = { keywords, programHash, inputHash, outputHash };
  return { keywords, journalData, programHash, inputHash, outputHash };
}

async function runRealZK(text: string): Promise<{ success: boolean; journalData?: any; proofBytes?: Buffer; }>{
  const session = `zk_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  await fs.mkdir(TEMP_DIR, { recursive: true });
  const inputFile = join(TEMP_DIR, `${session}_input.txt`);
  const journalFile = join(TEMP_DIR, `${session}_journal.json`);
  const proofFile = join(TEMP_DIR, `${session}_proof.bin`);
  await fs.writeFile(inputFile, text, 'utf8');
  try {
    const { success } = await runZKHost(inputFile, journalFile, proofFile);
    if (!success) return { success: false };
    const [journalRaw, proofBytes] = await Promise.all([
      fs.readFile(journalFile, 'utf8'),
      fs.readFile(proofFile)
    ]);
    let journalData: any;
    try { journalData = JSON.parse(journalRaw); } catch { journalData = { raw: journalRaw }; }
    return { success: true, journalData, proofBytes };
  } finally {
    Promise.allSettled([
      fs.unlink(inputFile),
      fs.unlink(journalFile),
      fs.unlink(proofFile)
    ]).catch(()=>{});
  }
}

function runZKHost(inputFile: string, journalFile: string, proofFile: string): Promise<{ success: boolean; error?: string }>{
  return new Promise(resolve => {
    const args = ['--in', inputFile, '--out', journalFile, '--proof', proofFile];
    const proc = spawn(ZK_HOST_BINARY, args, { stdio: ['ignore','pipe','pipe'] });
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(()=>!proc.killed && proc.kill('SIGKILL'), 4000);
      resolve({ success: false, error: 'timeout' });
    }, 180000);
    proc.on('close', code => { clearTimeout(timeout); resolve({ success: code === 0 }); });
    proc.on('error', err => { clearTimeout(timeout); resolve({ success: false, error: err.message }); });
  });
}

async function safeAddFile(buf: Buffer | Uint8Array | string): Promise<string | null> {
  try {
    const b: Buffer = typeof buf === 'string' ? Buffer.from(buf) : Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const bytes = Uint8Array.from(b);
    return await addFile(bytes);
  } catch { return null; }
}

// ----- Utility helpers for provenance -----
function canonicalizeParams(p?: Record<string, any>): Record<string, any> {
  const base: Record<string, any> = { temperature: 0, top_p: 1, ...(p || {}) };
  const sorted: Record<string, any> = {};
  for (const k of Object.keys(base).sort()) sorted[k] = base[k];
  return sorted;
}

function toBytes32(hexish: string): string {
  let h = hexish.trim();
  if (h.startsWith('sha256:')) h = '0x' + h.slice(7);
  if (!h.startsWith('0x')) h = '0x' + h;
  h = h.toLowerCase();
  // left pad if shorter than 66 chars (0x + 64)
  if (h.length < 66) {
    const nox = h.slice(2);
    h = '0x' + nox.padStart(64, '0');
  }
  return h.slice(0, 66);
}

function programHashFromAny(value: string): string {
  // Accept raw hex, sha256:<hex>, or other placeholder -> return hex body; fallback ZERO_HASH
  if (!value) return ZERO_HASH;
  if (value === '<FILLED_BY_HOST>') return ZERO_HASH;
  if (value.startsWith('sha256:')) return value.slice(7);
  if (value.startsWith('0x')) return value.slice(2);
  return value;
}