import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { summarizeWithProvider, ProviderName } from '../../../api/providers';
import { addFile } from '../../../api/ipfs';

// Configurable paths (keep binary path; gate execution behind flags)
const ZK_HOST_BINARY = process.env.ZK_HOST_BINARY || (process.env.NODE_ENV === 'production' ? '/app/bin/zkhost' : './zk/target/release/zkhost');
const TEMP_DIR = process.env.ZK_TEMP_DIR || (process.env.NODE_ENV === 'production' ? '/tmp' : './zk');

interface ApiResponse {
  summary: string;          // bound (proved if zk ran) summary
  providerSummary?: string; // provider output (not bound if zk used)
  programHash: string;
  inputHash: string;
  outputHash: string;
  zk: {
    mode: 'disabled' | 'mock' | 'real' | 'failed';
    proofCid: string;
    journalCid: string;
  };
  provider: ProviderName;
  model: string;
  signer: string;
  timestamp: number; // epoch ms
  warnings?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const { text, signer = 'unknown', provider = 'mock', model, useZk = false }: { text: string; signer?: string; provider?: ProviderName; model?: string; useZk?: boolean } = body;

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

    // Base hashes (provider version)
    const inputHash = sha256Hex(text);
    let boundSummary = providerSummaryData.summary;
    let outputHash = sha256Hex(boundSummary);
    let programHash = providerSummaryData.modelHash;
    let zkMode: ApiResponse['zk']['mode'] = 'disabled';
    let proofCid = 'ipfs_unavailable_proof';
    let journalCid = 'ipfs_unavailable_journal';

    if (useZk) {
      // Gate real execution
      const zkEnabled = process.env.ZK_HOST_ENABLED === '1';
      const forceMock = process.env.MOCK_ZK === 'true' || !zkEnabled;

      if (forceMock) {
        zkMode = 'mock';
        const mock = await generateMockJournal(text);
        boundSummary = generateSummaryText(mock.keywords);
        programHash = mock.programHash;
        outputHash = mock.outputHash; // Already hash of keywords JSON; we re-hash boundSummary for clarity if desired
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
        const real = await runRealZK(text).catch(e => {
          warnings.push('zk_exec_error');
          return null;
        });
        if (real && real.success && real.journalData) {
          zkMode = 'real';
            const keywords = real.journalData.keywords || [];
            boundSummary = generateSummaryText(keywords);
            programHash = real.journalData.programHash || programHash;
            outputHash = sha256Hex(boundSummary);
            try {
              const [j, p] = await Promise.all([
                safeAddFile(Buffer.from(JSON.stringify(real.journalData))),
                safeAddFile(real.proofBytes || Buffer.from(''))
              ]);
              if (j) journalCid = j;
              if (p) proofCid = p;
            } catch {
              warnings.push('real_zk_ipfs_failed');
            }
        } else {
          zkMode = 'failed';
          warnings.push('zk_failed_fallback_provider');
        }
      }
    }

    const response: ApiResponse = {
      summary: boundSummary,
      providerSummary: providerSummaryData.summary,
      programHash,
      inputHash,
      outputHash,
      zk: { mode: zkMode, proofCid, journalCid },
      provider,
      model: providerSummaryData.model,
      signer,
      timestamp: Date.now(),
      warnings: warnings.length ? warnings : undefined
    };

    return NextResponse.json(response);
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