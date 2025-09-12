/**
 * IPFS client and upload utilities
 */

import { create, IPFSHTTPClient } from 'ipfs-http-client';

/**
 * Get IPFS client instance (server-side only)
 */
export function getIpfs(): IPFSHTTPClient {
  const ipfsUrl = process.env.IPFS_API_URL || 'http://localhost:5001';
  return create({ url: ipfsUrl });
}

/**
 * Add a file to IPFS
 */
export async function addFile(file: Blob | File | Uint8Array): Promise<string> {
  const ipfs = getIpfs();
  
  let content: Uint8Array;
  
  if (file instanceof Uint8Array) {
    content = file;
  } else {
    content = new Uint8Array(await file.arrayBuffer());
  }
  
  const result = await ipfs.add(content);
  return result.cid.toString();
}

/**
 * Add JSON data to IPFS
 */
export async function addJson(data: any): Promise<string> {
  const jsonString = JSON.stringify(data, null, 2);
  const content = new TextEncoder().encode(jsonString);
  return addFile(content);
}

/**
 * Retrieve file from IPFS
 */
export async function getFile(cid: string): Promise<Uint8Array> {
  const ipfs = getIpfs();
  const chunks: Uint8Array[] = [];
  
  for await (const chunk of ipfs.cat(cid)) {
    chunks.push(chunk as Uint8Array);
  }
  
  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Retrieve JSON data from IPFS
 */
export async function getJson(cid: string): Promise<any> {
  const data = await getFile(cid);
  const jsonString = new TextDecoder().decode(data);
  return JSON.parse(jsonString);
}

/**
 * Pin a file to ensure it stays available
 */
export async function pinFile(cid: string): Promise<void> {
  const ipfs = getIpfs();
  await ipfs.pin.add(cid);
}

/**
 * Get IPFS gateway URL for a CID
 */
export function getGatewayUrl(cid: string): string {
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://ipfs.io/ipfs';
  return `${gateway}/${cid}`;
}