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
  // New flattened provenance struct (Stage 0-2)
  ContentProvenance: [
    { name: "version", type: "uint8" },
    { name: "modelId", type: "string" },
    { name: "modelHash", type: "string" },
    { name: "promptHash", type: "bytes32" },
    { name: "outputHash", type: "bytes32" },
    { name: "paramsHash", type: "bytes32" },
    { name: "contentCid", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "attestationStrategy", type: "string" },
    { name: "keywordsHash", type: "bytes32" },
    { name: "programHash", type: "bytes32" },
    { name: "journalCid", type: "string" },
    { name: "proofCid", type: "string" }
  ]
} as const;

// TypeScript type for SaveProof
export type SaveProof = {
  cid: string;
  modelHash: string;
  timestamp: string;
};

// 32-byte zero constant for unused hashes
export const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Flattened provenance value used for signing (EIP-712 ContentProvenance)
export interface ContentProvenanceValue {
  version: number;              // schema version
  modelId: string;              // provider/model identifier (e.g. openai:gpt-4o-mini)
  modelHash: string;            // weight hash or empty string if proprietary
  promptHash: string;           // bytes32
  outputHash: string;           // bytes32 hash of generated content
  paramsHash: string;           // bytes32 hash of canonical params JSON
  contentCid: string;           // CID of raw generated content
  timestamp: number;            // unix epoch ms
  attestationStrategy: string;  // e.g. 'none' | 'zk-keywords'
  keywordsHash: string;         // bytes32 (keywords canonical JSON) or ZERO_HASH
  programHash: string;          // bytes32 (image/program ID) or ZERO_HASH
  journalCid: string;           // CID or ''
  proofCid: string;             // CID or ''
}

// Response object returned from /api/summarize before signing
export interface UnsignedProvenanceResponse {
  provenance: ContentProvenanceValue; // value to sign
  domain: typeof domain;              // EIP-712 domain
  types: typeof types;                // includes ContentProvenance
  primaryType: string;                // 'ContentProvenance'
  // Additional helpful fields
  providerOutput?: string;            // raw provider content (same as stored at contentCid)
  promptCid?: string;                 // CID of original prompt text (not part of signed struct)
  zk?: {
    mode: 'disabled' | 'real' | 'mock' | 'failed';
    journalCid?: string;
    proofCid?: string;
    warnings?: string[];
  };
}

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