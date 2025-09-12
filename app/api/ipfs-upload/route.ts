import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('IPFS upload route called');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('File converted to buffer, size:', buffer.length);

    // Use direct HTTP API call to IPFS
    const ipfsUrl = process.env.IPFS_API_URL || 'http://ipfs:5001';
    
    // Create proper multipart form data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const CRLF = '\r\n';
    
    const formDataParts = [
      `--${boundary}${CRLF}`,
      `Content-Disposition: form-data; name="file"; filename="${file.name || 'file'}"${CRLF}`,
      `Content-Type: ${file.type || 'application/octet-stream'}${CRLF}`,
      CRLF,
    ];
    
    const header = Buffer.from(formDataParts.join(''), 'utf8');
    const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
    const body = Buffer.concat([header, buffer, footer]);

    console.log('Making request to IPFS:', `${ipfsUrl}/api/v0/add?pin=true`);
    const response = await fetch(`${ipfsUrl}/api/v0/add?pin=true`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body: body,
    });

    if (!response.ok) {
      console.error('IPFS API error:', response.status, response.statusText);
      throw new Error(`IPFS API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('IPFS response:', result);

    return NextResponse.json({
      cid: result.Hash,
      path: result.Name,
      size: parseInt(result.Size),
    });
  } catch (error) {
    console.error('IPFS upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload to IPFS' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'IPFS upload endpoint' }, { status: 200 });
}