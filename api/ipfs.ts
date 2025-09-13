/**
 * IPFS client and upload utilities
 */

/**
 * Add a file to IPFS using HTTP API directly
 */
export async function addFile(file: Blob | File | Uint8Array): Promise<string> {
  // Use mock IPFS for development to avoid network issues
  if (process.env.NODE_ENV !== 'production') {
    // Generate a mock CID based on content hash
    let content: Uint8Array;
    if (file instanceof Uint8Array) {
      content = file;
    } else {
      content = new Uint8Array(await file.arrayBuffer());
    }
    
    // Simple hash function for mock CID
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash + content[i]) & 0xffffffff;
    }
    const mockCid = `Qm${Math.abs(hash).toString(36).padStart(44, '0')}`;
    console.log(`🔧 Mock IPFS: Generated CID ${mockCid} for ${content.length} bytes`);
    return mockCid;
  }
  
  // Production IPFS upload
  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL || 'http://ipfs:5001';
  
  let content: Uint8Array;
  
  if (file instanceof Uint8Array) {
    content = file;
  } else {
    content = new Uint8Array(await file.arrayBuffer());
  }
  
  const formData = new FormData();
  formData.append('file', new Blob([content]));
  
  const response = await fetch(`${ipfsUrl}/api/v0/add`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.Hash;
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
  // Use public IPFS gateway for development, Docker service for production
  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL || 
    (process.env.NODE_ENV === 'production' ? 'http://ipfs:5001' : 'https://ipfs.infura.io:5001');
  
  const response = await fetch(`${ipfsUrl}/api/v0/cat?arg=${cid}`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    throw new Error(`IPFS get failed: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
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
  // Use public IPFS gateway for development, Docker service for production
  const ipfsUrl = process.env.NEXT_PUBLIC_IPFS_API_URL || 
    (process.env.NODE_ENV === 'production' ? 'http://ipfs:5001' : 'https://ipfs.infura.io:5001');
  
  const response = await fetch(`${ipfsUrl}/api/v0/pin/add?arg=${cid}`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    throw new Error(`IPFS pin failed: ${response.statusText}`);
  }
}

/**
 * Get IPFS gateway URL for a CID
 */
export function getGatewayUrl(cid: string): string {
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://ipfs.io/ipfs';
  return `${gateway}/${cid}`;
}