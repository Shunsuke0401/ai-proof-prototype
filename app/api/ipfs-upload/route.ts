import { NextRequest, NextResponse } from 'next/server';

// Helper to resolve IPFS API base URL
function resolveIpfsApi(): string {
  // Allow explicit override, else try common local defaults. (Only first truthy used)
  return process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
}

export async function POST(request: NextRequest) {
  try {
    console.log('[ipfs-upload] route called');
    const incoming = await request.formData();
    const file = incoming.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ipfsUrl = resolveIpfsApi();

    // Use native FormData for the outgoing request to IPFS to avoid manual boundary issues.
    const outbound = new FormData();
    // The IPFS HTTP API expects the field name to be 'file'
    outbound.append('file', file, file.name || 'file');

    console.log('[ipfs-upload] uploading to', `${ipfsUrl}/api/v0/add?pin=true`);
    const response = await fetch(`${ipfsUrl}/api/v0/add?pin=true`, {
      method: 'POST',
      body: outbound as any, // cast to satisfy TypeScript in Node runtime
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[ipfs-upload] IPFS API error:', response.status, response.statusText, text.slice(0, 300));
      throw new Error(`IPFS API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[ipfs-upload] success:', result);

    // Result fields: Hash, Name, Size (strings)
    return NextResponse.json({
      cid: result.Hash,
      path: result.Name,
      size: parseInt(result.Size, 10) || 0,
    });
  } catch (error) {
    console.error('[ipfs-upload] upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload to IPFS', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'IPFS upload endpoint' }, { status: 200 });
}