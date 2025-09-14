/**
 * IPFS client and upload utilities
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock storage for development
const MOCK_STORAGE_FILE = path.join(process.cwd(), 'mock-ipfs-storage.json');

function loadMockStorage(): Record<string, string> {
  try {
    if (fs.existsSync(MOCK_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(MOCK_STORAGE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Failed to load mock IPFS storage:', e);
  }
  return {};
}

function saveMockStorage(storage: Record<string, string>): void {
  try {
    fs.writeFileSync(MOCK_STORAGE_FILE, JSON.stringify(storage, null, 2));
  } catch (e) {
    console.warn('Failed to save mock IPFS storage:', e);
  }
}

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
    
    // Store content in mock storage
    const storage = loadMockStorage();
    storage[mockCid] = Buffer.from(content).toString('base64');
    saveMockStorage(storage);
    
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
  // Use mock IPFS for development
  if (process.env.NODE_ENV !== 'production') {
    const storage = loadMockStorage();
    const base64Content = storage[cid];
    if (!base64Content) {
      throw new Error(`Mock IPFS: CID ${cid} not found in storage`);
    }
    const buffer = Buffer.from(base64Content, 'base64');
    console.log(`🔧 Mock IPFS: Retrieved CID ${cid} (${buffer.length} bytes)`);
    return new Uint8Array(buffer);
  }
  
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