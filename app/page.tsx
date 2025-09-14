'use client';

/**
 * Main page component for AI Proof Prototype
 */

import { useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import dynamic from 'next/dynamic';
import WalletBox from './components/WalletBox';
import { domain, types, SaveProof, ProcessStatus, UploadResult } from '../api/types';
import { deriveKeyFromSignatureHex, encryptAesGcm, stringToUint8Array } from '../api/crypto';

// Helper function to upload files via our API endpoint
const uploadToIpfs = async (data: Uint8Array | string): Promise<string> => {
  const formData = new FormData();
  
  let blob: Blob;
  if (typeof data === 'string') {
    blob = new Blob([data], { type: 'application/json' });
  } else {
    blob = new Blob([data], { type: 'application/octet-stream' });
  }
  
  formData.append('file', blob);
  
  const response = await fetch('/api/ipfs-upload', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.cid;
};

export default function Home() {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [modelHash, setModelHash] = useState('');
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const handleSummarize = async () => {
    if (!text.trim()) {
      setError('Please enter some text to summarize');
      return;
    }

    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setError(null);
      setStatus('summarizing');

      // Generate ZK summary
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout for ZK proof
      
      const summaryResponse = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, signer: address }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!summaryResponse.ok) {
        throw new Error('Failed to generate ZK summary');
      }

      const summaryData = await summaryResponse.json();
      
      // Debug: Log the response data
      console.log('Summary response data:', summaryData);
      console.log('zkProof object:', summaryData.zkProof);
      console.log('programHash value:', summaryData.zkProof?.programHash);
      
      // Set the summary and program hash for display
      setSummary(summaryData.summary);
      const programHash = summaryData.zkProof?.programHash || '';
      console.log('Setting modelHash to:', programHash);
      setModelHash(programHash);
      setStatus('idle');

    } catch (err) {
      console.error('Error in ZK summarize:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
    }
  };

  const handleSave = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!summary.trim()) {
      setError('Please generate a summary first');
      return;
    }

    // Debug: Check modelHash value before signing
    console.log('Current modelHash value:', modelHash);
    console.log('ModelHash length:', modelHash.length);
    console.log('ModelHash type:', typeof modelHash);
    
    if (!modelHash || modelHash.trim() === '' || modelHash === '<FILLED_BY_HOST>') {
      setError('Model hash is missing or invalid. Please generate a summary first.');
      return;
    }

    try {
      setError(null);
      setStatus('encrypting');

      // Create temporary signature for key derivation
      const timestamp = new Date().toISOString();
      const tempValue: SaveProof = {
        cid: 'temp', // Will be updated after encryption
        modelHash: modelHash,
        timestamp
      };
      
      // Debug: Log the value being signed
      console.log('Signing tempValue:', tempValue);

      // Sign the temporary data to get signature for encryption
      const tempSignature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'SaveProof',
        message: tempValue
      });

      // Encrypt the summary
      const key = await deriveKeyFromSignatureHex(tempSignature);
      const summaryBytes = stringToUint8Array(summary);
      const { iv, ciphertext } = await encryptAesGcm(summaryBytes, key);

      // Combine IV and ciphertext for storage
      const encryptedData = new Uint8Array(iv.length + ciphertext.length);
      encryptedData.set(iv, 0);
      encryptedData.set(ciphertext, iv.length);

      setStatus('uploading');

      // Upload encrypted data to IPFS
      const encryptedCid = await uploadToIpfs(encryptedData);

      // Create final signature with actual CID
      setStatus('signing');
      const finalValue: SaveProof = {
        cid: encryptedCid,
        modelHash: modelHash,
        timestamp
      };

      const finalSignature = await signTypedDataAsync({
        domain,
        types,
        primaryType: 'SaveProof',
        message: finalValue
      });

      // Create metadata and upload to IPFS
      const summaryMetadata = {
        summary: summary,
        model: 'llama3',
        modelHash: modelHash,
        params: {},
        signer: address,
        timestamp,
        originalTextHash: await calculateTextHash(text),
        encryptedCid
      };

      const signatureData = {
        signature: finalSignature,
        domain,
        types,
        value: finalValue,
        signer: address,
        timestamp
      };

      // Upload metadata and signature
      const [summaryCid, signatureCid] = await Promise.all([
        uploadToIpfs(JSON.stringify(summaryMetadata, null, 2)),
        uploadToIpfs(JSON.stringify(signatureData, null, 2))
      ]);

      setStatus('completed');
      setResult({
        encryptedCid,
        summaryCid,
        signatureCid
      });

    } catch (err) {
      console.error('Error in save:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
    }
  };

  const calculateTextHash = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'summarizing':
        return <span className="status-indicator status-loading">🤖 Generating summary...</span>;
      case 'encrypting':
        return <span className="status-indicator status-loading">🔐 Encrypting data...</span>;
      case 'signing':
        return <span className="status-indicator status-loading">✍️ Signing with wallet...</span>;
      case 'uploading':
        return <span className="status-indicator status-loading">📤 Uploading to IPFS...</span>;
      case 'completed':
        return <span className="status-indicator status-success">✅ Completed successfully!</span>;
      case 'error':
        return <span className="status-indicator status-error">❌ Error occurred</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Proof Prototype</h1>
          <p className="text-lg text-gray-600">
            AI summarization with Ethereum wallet signing and IPFS storage
          </p>
        </header>

        <WalletBox />

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Text Summarization</h2>
          
          <div className="mb-4">
            <label htmlFor="text-input" className="block text-sm font-medium text-gray-700 mb-2">
              Enter text to summarize:
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-40 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="Enter your text here..."
              disabled={status !== 'idle' && status !== 'error'}
            />
          </div>

          <div className="mb-4">
            <button
              onClick={handleSummarize}
              disabled={!text.trim() || (status !== 'idle' && status !== 'error')}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Summarize with AI
            </button>
          </div>

          {summary && (
            <div className="mb-4">
              <label htmlFor="summary-output" className="block text-sm font-medium text-gray-700 mb-2">
                AI Generated Summary:
              </label>
              <textarea
                id="summary-output"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Summary will appear here..."
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleSave}
              disabled={!isConnected || !summary.trim() || (status !== 'idle' && status !== 'error')}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            
            <div className="flex items-center">
              {getStatusDisplay()}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Results</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Encrypted Data CID:</label>
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm break-all text-gray-900">
                  {result.encryptedCid}
                </code>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Summary Metadata CID:</label>
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm break-all text-gray-900">
                  {result.summaryCid}
                </code>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Signature CID:</label>
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm break-all text-gray-900">
                  {result.signatureCid}
                </code>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-700 text-sm">
                💡 Your summary has been encrypted, signed, and stored on IPFS. 
                Use the verification script to validate the signature and model hash.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}