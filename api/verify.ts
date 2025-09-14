import { verifyTypedData } from 'viem';

export interface VerificationInput {
  summaryCid: string;
  signatureCid: string;
  expectedProgramHash?: string;
  ipfsGateway?: string;
}

export interface VerificationDetails {
  programHash?: string;
  inputHash?: string;
  outputHash?: string;
  signer?: string;
  timestamp?: string;
  dockerDigest?: string; // not available in JS path, placeholder
  summaryCid: string;
  signatureCid: string;
  modelHash?: string;
  signatureValid: boolean;
  hashMatches?: boolean;
  programHashMatches?: boolean;
}

export interface VerificationResult {
  success: boolean;
  message: string;
  details?: VerificationDetails;
  errors?: string[];
  warnings?: string[];
  raw?: any;
}

const DEFAULT_GATEWAYS = [
  'http://127.0.0.1:8080/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs'
];

// Basic CID validators (v0 + common v1 prefix 'bafy')
const CID_V0_REGEX = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/; // base58btc
const CID_V1_REGEX = /^bafy[1-9A-HJ-NP-Za-km-z]{30,}$/; // loose check base32

function isLikelyCid(cid: string) {
  return CID_V0_REGEX.test(cid) || CID_V1_REGEX.test(cid);
}

interface FetchAttemptResult {
  data?: any;
  gateway?: string;
  error?: string;
}

async function fetchJsonFromIpfsMulti(cid: string, gateways: string[], timeoutMs = 8000, maxRetries = 2): Promise<FetchAttemptResult> {
  const errors: string[] = [];
  for (const gw of gateways) {
    const base = gw.replace(/\/$/, '');
    const url = `${base}/${cid}`;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs + attempt * 1000);
      try {
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) {
          errors.push(`${gw} status ${res.status}`);
          break; // move to next gateway (do not retry same gw on hard status)
        }
        const json = await res.json();
        return { data: json, gateway: gw };
      } catch (e: any) {
        clearTimeout(id);
        const msg = e.name === 'AbortError' ? 'timeout' : e.message;
        if (attempt === maxRetries) {
          errors.push(`${gw} attempt ${attempt + 1}: ${msg}`);
        } else {
          // exponential backoff
          await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
          continue; // retry same gateway
        }
      }
    }
  }
  return { error: `All gateways failed for ${cid}: ${errors.join(' | ')}` };
}

export async function verifyContent(input: VerificationInput): Promise<VerificationResult> {
  const errors: string[] = [];
  // Build gateway list (env can provide comma separated list)
  const envList = (process.env.IPFS_GATEWAYS || input.ipfsGateway || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const gateways = Array.from(new Set([...envList, ...(input.ipfsGateway ? [input.ipfsGateway] : []), ...DEFAULT_GATEWAYS]));

  if (!isLikelyCid(input.summaryCid)) errors.push('Invalid summary CID format');
  if (!isLikelyCid(input.signatureCid)) errors.push('Invalid signature CID format');
  if (errors.length) return { success: false, message: 'Input validation failed', errors };

  try {
    const summaryFetch = await fetchJsonFromIpfsMulti(input.summaryCid, gateways);
    const signatureFetch = await fetchJsonFromIpfsMulti(input.signatureCid, gateways);
    if (summaryFetch.error) errors.push(summaryFetch.error);
    if (signatureFetch.error) errors.push(signatureFetch.error);
    if (errors.length) return { success: false, message: 'IPFS fetch failed', errors };

    const summary = summaryFetch.data;
    const signature = signatureFetch.data;

    // Validate structural fields
  const requiredSummary = ['signer','timestamp'];
  const optionalSummary = ['programHash','inputHash','outputHash','modelHash'];
  const warnings: string[] = [];
  for (const f of requiredSummary) if (!(f in summary)) errors.push(`Missing field in summary: ${f}`);
  for (const f of optionalSummary) if (!(f in summary)) warnings.push(`Missing optional field in summary: ${f}`);
    const requiredSig = ['signer','signature','value'];
    for (const f of requiredSig) if (!(f in signature)) errors.push(`Missing field in signature JSON: ${f}`);
  if (errors.length) return { success: false, message: 'Summary or signature JSON missing required fields', errors, warnings };

    // Cross consistency checks
    if (summary.signer !== signature.signer) errors.push('Signer mismatch');
    if (summary.programHash && signature.value?.modelHash && summary.programHash !== signature.value.modelHash) {
      errors.push('Program/model hash mismatch');
    }
    // Normalize timestamps: summary.timestamp might be number (epoch ms) while signature.value.timestamp is ISO
    if (summary.timestamp && signature.value?.timestamp) {
      const normalize = (t: any) => {
        if (typeof t === 'number') return new Date(t).toISOString();
        if (/^\d+$/.test(t)) return new Date(Number(t)).toISOString();
        try { return new Date(t).toISOString(); } catch { return String(t); }
      };
      const sNorm = normalize(summary.timestamp);
      const sigNorm = normalize(signature.value.timestamp);
      if (sNorm !== sigNorm) {
        errors.push('Timestamp mismatch');
      } else {
        // store normalized form for details output
        summary.timestamp = sNorm;
      }
    }

    // Treat explicit 'unsigned' marker as invalid signature (add warning rather than throwing)
    if (signature.signature === 'unsigned') {
      errors.push('Content was saved without a cryptographic signature (unsigned)');
    }

    // EIP-712 verification (expect signature JSON to embed domain/types/value)
    let signatureValid = false;
    try {
      signatureValid = await verifyTypedData({
        address: signature.signer,
        domain: signature.domain,
        types: signature.types,
        primaryType: 'SaveProof',
        message: signature.value,
        signature: signature.signature
      });
    } catch (e: any) {
      errors.push('Signature verification threw: ' + e.message);
    }

    // Program hash expectation
    let programHashMatches: boolean | undefined = undefined;
    if (input.expectedProgramHash) {
      programHashMatches = summary.programHash === input.expectedProgramHash;
      if (!programHashMatches) errors.push('Expected program hash mismatch');
    }

    const success = signatureValid && errors.length === 0;
    // Fallback: if programHash missing but modelHash present, treat it as programHash for matching
    if (!summary.programHash && summary.modelHash) {
      summary.programHash = summary.modelHash;
      warnings.push('programHash missing; using modelHash fallback');
    }

    return {
      success,
      message: success ? 'Verification succeeded' : 'Verification failed',
      details: {
        programHash: summary.programHash,
        inputHash: summary.inputHash,
        outputHash: summary.outputHash,
        signer: summary.signer,
        timestamp: summary.timestamp,
        summaryCid: input.summaryCid,
        signatureCid: input.signatureCid,
        modelHash: signature.value?.modelHash,
        signatureValid,
        programHashMatches
      },
      errors: errors.length ? errors : undefined,
      warnings: warnings.length ? warnings : undefined,
      raw: { summary, signature, gatewaysTried: gateways, summaryGateway: summaryFetch.gateway, signatureGateway: signatureFetch.gateway }
    };
  } catch (e: any) {
    return { success: false, message: 'Exception during verification', errors: [e.message] };
  }
}

export default verifyContent;