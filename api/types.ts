/**
 * TypeScript types and EIP-712 schema definitions
 */

// EIP-712 Domain
export const domain = {
  name: "AIProof",
  version: "1",
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

// EIP-712 Types
export const types = {
  SaveProof: [
    { name: "cid", type: "string" },
    { name: "modelHash", type: "string" },
    { name: "timestamp", type: "string" },
  ],
} as const;

// TypeScript type for SaveProof
export type SaveProof = {
  cid: string;
  modelHash: string;
  timestamp: string;
};

// AI Model response
export interface AIModelResponse {
  summary: string;
  model: string;
  modelHash: string;
  params: Record<string, any>;
}

// Summary metadata stored in IPFS
export interface SummaryMetadata {
  summary: string;
  model: string;
  modelHash: string;
  params: Record<string, any>;
  signer: string;
  timestamp: string;
  originalTextHash: string;
  encryptedCid: string;
}

// Signature data stored in IPFS
export interface SignatureData {
  signature: string;
  domain: typeof domain;
  types: typeof types;
  value: SaveProof;
  signer: string;
  timestamp: string;
}

// Encryption result
export interface EncryptionResult {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

// Upload result with all CIDs
export interface UploadResult {
  encryptedCid: string;
  summaryCid: string;
  signatureCid: string;
}

// Status for UI
export type ProcessStatus = 
  | 'idle'
  | 'summarizing'
  | 'encrypting'
  | 'signing'
  | 'uploading'
  | 'completed'
  | 'error';

// Error response
export interface ErrorResponse {
  error: string;
  details?: string;
}

// Ollama API request
export interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}

// Ollama API response
export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}