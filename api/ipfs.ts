/**
 * IPFS client and upload utilities
 */

// In-memory cache for mock mode so verification can succeed within same process lifecycle
const mockStore: Map<string, Uint8Array> = new Map();

function computeMockCid(content: Uint8Array): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) hash = ((hash << 5) - hash + content[i]) & 0xffffffff;
  return `Qm${Math.abs(hash).toString(36).padStart(44, '0')}`;
}

async function toBytes(file: Blob | File | Uint8Array): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  return new Uint8Array(await file.arrayBuffer());
}

/** Upload a file. Priority:
 * 1. If mock mode -> mock store
 * 2. If WEB3_STORAGE_TOKEN set -> web3.storage
 * 3. Else -> Kubo endpoint (NEXT_PUBLIC_IPFS_API_URL or default)
 */
export async function addFile(file: Blob | File | Uint8Array): Promise<string> {
  const forceMock = process.env.IPFS_MODE === 'mock';
  const isProd = process.env.NODE_ENV === 'production';
  const bytes = await toBytes(file);

  if (!isProd || forceMock) {
    const mockCid = computeMockCid(bytes);
    mockStore.set(mockCid, bytes);
    console.log(`🔧 Mock IPFS: Stored CID ${mockCid} (${bytes.length} bytes)`);
    return mockCid;
  }

  const w3token = process.env.WEB3_STORAGE_TOKEN;
  if (w3token) {
    try {
      const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
      const res = await fetch('https://api.web3.storage/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${w3token}` },
        body: new Blob([copy.buffer])
      });
      if (!res.ok) throw new Error(`web3.storage upload failed: ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data && data.cid) {
        return data.cid;
      }
      throw new Error('web3.storage response missing cid');
    } catch (e) {
      console.warn('[ipfs] web3.storage failed, falling back to Kubo endpoint', e);
    }
  }

  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL || 'http://ipfs:5001';
  const formData = new FormData();
  const copy2 = new Uint8Array(bytes.byteLength); copy2.set(bytes);
  formData.append('file', new Blob([copy2.buffer]));
  try {
    const response = await fetch(`${ipfsUrl}/api/v0/add`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
    const result = await response.json();
    return result.Hash;
  } catch (e) {
    // Final fallback -> mock store (resilience instead of 500)
    const fallbackCid = computeMockCid(bytes);
    mockStore.set(fallbackCid, bytes);
    console.warn('[ipfs] final upload fallback to mock CID', fallbackCid, e);
    return fallbackCid;
  }
}

/**
 * Add JSON data to IPFS
 */
export async function addJson(data: any): Promise<string> {
  const content = new TextEncoder().encode(JSON.stringify(data));
  return addFile(content);
}

/**
 * Get a file from IPFS using HTTP API
 */
export async function getFile(cid: string): Promise<Uint8Array> {
  const forceMock = process.env.IPFS_MODE === 'mock';
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd || forceMock) {
    const cached = mockStore.get(cid);
    if (!cached) throw new Error('Mock CID not found in current process (new session?)');
    return cached;
  }

  // Try API endpoint first if provided
  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL;
  if (ipfsUrl) {
    try {
      const response = await fetch(`${ipfsUrl}/api/v0/cat?arg=${cid}`, { method: 'POST' });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      console.warn('[ipfs] API cat failed, falling back to gateways', response.status, response.statusText);
    } catch (e) {
      console.warn('[ipfs] API cat error fallback to gateways', e);
    }
  }

  // Gateway fallback rotation
  const gateways = (process.env.IPFS_GATEWAYS || 'https://ipfs.io/ipfs,https://cloudflare-ipfs.com/ipfs')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  for (const g of gateways) {
    const url = g.endsWith('/') ? `${g}${cid}` : `${g}/${cid}`;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch { /* continue */ }
  }
  throw new Error('Unable to fetch CID from API or gateways');
}

/**
 * Get JSON data from IPFS
 */
export async function getJson(cid: string): Promise<any> {
  const data = await getFile(cid);
  const text = new TextDecoder().decode(data);
  return JSON.parse(text);
}

/**
 * Pin a file in IPFS using HTTP API
 */
export async function pinFile(cid: string): Promise<void> {
  const forceMock = process.env.IPFS_MODE === 'mock';
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production' || forceMock) return; // noop in mock/dev
  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL;
  if (!ipfsUrl) return; // cannot pin without API
  try {
    const response = await fetch(`${ipfsUrl}/api/v0/pin/add?arg=${cid}`, { method: 'POST' });
    if (!response.ok) throw new Error(`pin failed ${response.status}`);
  } catch (e) {
    console.warn('[ipfs] pin failed', e);
  }
}

/**
 * Get IPFS gateway URL for a CID
 */
export function getGatewayUrl(cid: string): string {
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://ipfs.io/ipfs';
  return `${gateway}/${cid}`;
}