# AI Proof Prototype

> AI summarization with Ethereum wallet signing and IPFS storage for transparent, verifiable AI outputs

## 🎯 Project Description

This prototype demonstrates a complete pipeline for creating verifiable AI-generated content with cryptographic proofs. It addresses the growing need for AI transparency and provenance by:

- **Local AI Processing**: Uses Ollama for private, local AI summarization
- **Cryptographic Signing**: EIP-712 wallet signatures for authenticity
- **Encrypted Storage**: AES-GCM encryption with signature-derived keys
- **Decentralized Storage**: IPFS for censorship-resistant data storage
- **Reproducible Builds**: Docker-based builds with verification scripts

## 🏆 Hackathon Requirement (c) Satisfaction

**Requirement**: Bit-for-bit reproducible build + minimal verifier script

**Our Implementation**:

1. **Reproducible Build**:
   - Pinned Node.js version (`node:20.11.1-bullseye`)
   - Locked dependencies with `npm ci`
   - Fixed locale/timezone (`LANG=C.UTF-8`, `TZ=UTC`)
   - Docker image digest tracking

2. **Minimal Verifier Script**:
   - `scripts/verify.sh`: Builds project, fetches IPFS data, verifies signatures
   - `scripts/verify-signature.js`: EIP-712 signature verification
   - Checks model hash consistency
   - Validates metadata integrity

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- Ethereum wallet (MetaMask, etc.)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ai-proof-prototype
cp .env.example .env
```

### 2. Run with Docker Compose

```bash
# Start all services (app, Ollama, IPFS)
docker compose up -d

# Wait for Ollama to download models (first run takes ~5-10 minutes)
docker compose logs -f ollama

# Access the app
open http://localhost:3000
```

### 3. Alternative: Local Development

```bash
# Install dependencies
npm install

# Start Ollama separately
# Download from: https://ollama.ai
ollama serve
ollama pull llama3

# Start IPFS node
# Download from: https://ipfs.io
ipfs daemon

# Start Next.js app
npm run dev
```

## 📱 How to Use

1. **Connect Wallet**: Click "Connect Wallet" and approve MetaMask connection
2. **Enter Text**: Type or paste text you want to summarize (max 10,000 chars)
3. **Summarize & Save**: Click the button to start the process:
   - 🤖 AI generates summary using local Ollama
   - 🔐 Summary is encrypted with wallet signature-derived key
   - ✍️ You sign EIP-712 typed data with your wallet
   - 📤 Encrypted data + metadata uploaded to IPFS
4. **Get Results**: Three CIDs are displayed:
   - `encrypted.bin`: AES-GCM encrypted summary
   - `summary.json`: Metadata (model, hash, signer, timestamp)
   - `signature.json`: EIP-712 signature proof

## 🔍 Verification

### Verify a Saved Summary

```bash
# Basic verification (signature + metadata)
./scripts/verify.sh <summary_cid> <signature_cid>

# With model hash verification
./scripts/verify.sh <summary_cid> <signature_cid> <expected_model_hash>

# Example
./scripts/verify.sh QmSummary123... QmSignature456... abc123def456...
```

### What the Verifier Checks

✅ **Reproducible Build**: Docker image digest consistency  
✅ **EIP-712 Signature**: Cryptographic proof of signer identity  
✅ **Model Hash**: AI model and parameters used  
✅ **Metadata Integrity**: Consistency across all stored files  
✅ **Timestamp Verification**: Chronological ordering  

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Wallet**: wagmi + viem + RainbowKit
- **AI**: Ollama (llama3, qwen2.5-3b)
- **Crypto**: Web Crypto API (AES-GCM, PBKDF2)
- **Storage**: IPFS (ipfs-http-client)
- **Build**: Docker + Docker Compose

### Data Flow

```
[User Text] → [Ollama AI] → [Summary]
     ↓
[Encrypt with Signature-Derived Key] → [Upload to IPFS]
     ↓
[EIP-712 Sign] → [Store Metadata + Signature]
     ↓
[Three CIDs: encrypted.bin, summary.json, signature.json]
```

### File Structure

```
/app
  /components/WalletBox.tsx     # Wallet connection UI
  /api/summarize/route.ts       # Ollama integration
  /api/verify-signature/route.ts # Signature verification
  page.tsx                      # Main UI
  layout.tsx                    # App layout
  providers.tsx                 # wagmi/RainbowKit setup
  globals.css                   # Tailwind styles

/api
  crypto.ts                     # AES-GCM encryption utilities
  ipfs.ts                       # IPFS client and upload
  model.ts                      # Ollama API integration
  types.ts                      # TypeScript definitions

/scripts
  verify.sh                     # Main verification script
  verify-signature.js           # EIP-712 signature checker

/expected
  model.sha256                  # Expected model hash
  image.digest                  # Docker image digest

Dockerfile                      # Reproducible build config
docker-compose.yml              # Multi-service setup
package.json                    # Dependencies (pinned versions)
.env.example                    # Environment variables
```

## 🔐 Security & Cryptography

### EIP-712 Typed Data Schema

```typescript
const domain = {
  name: "AIProof",
  version: "1",
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000000"
};

const types = {
  SaveProof: [
    { name: "cid", type: "string" },      // IPFS CID of encrypted data
    { name: "modelHash", type: "string" }, // Hash of AI model + params
    { name: "timestamp", type: "string" }  // ISO timestamp
  ]
};
```

### Encryption Process

1. **Key Derivation**: `signature_hex → SHA256 → PBKDF2 → AES-GCM key`
2. **Encryption**: `AES-GCM-256` with random IV
3. **Storage**: `IV + ciphertext` uploaded to IPFS

### Model Hash Calculation

```typescript
// Deterministic hash of model name + parameters
const modelString = JSON.stringify({ model, params }, Object.keys({ model, params }).sort());
const modelHash = SHA256(modelString);
```

## 🌐 IPFS Storage Schema

### `encrypted.bin`
```
[12-byte IV][Variable-length AES-GCM ciphertext]
```

### `summary.json`
```json
{
  "summary": "AI-generated summary text",
  "model": "llama3",
  "modelHash": "abc123...",
  "params": { "temperature": 0.7, "top_p": 0.9 },
  "signer": "0x742d35Cc6634C0532925a3b8D4C9db96590b5b8c",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "originalTextHash": "def456...",
  "encryptedCid": "QmEncrypted123..."
}
```

### `signature.json`
```json
{
  "signature": "0x1234567890abcdef...",
  "domain": { /* EIP-712 domain */ },
  "types": { /* EIP-712 types */ },
  "value": { /* SaveProof message */ },
  "signer": "0x742d35Cc6634C0532925a3b8D4C9db96590b5b8c",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Ollama Configuration
OLLAMA_API_URL=http://localhost:11434

# IPFS Configuration
NEXT_PUBLIC_IPFS_API_URL=http://localhost:5001
NEXT_PUBLIC_IPFS_GATEWAY=https://ipfs.io/ipfs

# Optional: Enhanced wallet support
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_ALCHEMY_ID=your_alchemy_key
```

### Supported AI Models

- `llama3` (default, ~4.7GB)
- `qwen2.5:3b` (~1.9GB)
- Any Ollama-compatible model

## 🧪 Testing & Development

### Run Tests

```bash
# Lint code
npm run lint

# Build for production
npm run build

# Test verification script
./scripts/verify.sh --help
```

### Development Workflow

1. Make changes to source code
2. Test locally with `npm run dev`
3. Build Docker image: `docker build -t ai-proof .`
4. Run verification: `./scripts/verify.sh <cids>`
5. Check reproducibility: Compare image digests

## 🚀 Future Extensions

### (a) Zero-Knowledge Proofs

- **ZK-SNARKs**: Prove AI model execution without revealing inputs
- **Circom circuits**: Verify model weights and computation steps
- **Privacy**: Generate summaries while keeping original text private

### (b) Trusted Execution Environments

- **Intel SGX**: Run AI models in secure enclaves
- **Remote Attestation**: Cryptographic proof of execution environment
- **Confidential Computing**: Protect both data and model weights

### Multi-Signer DAO Logs

- **Threshold Signatures**: Require multiple DAO members to sign
- **Governance Integration**: Link to on-chain voting records
- **Audit Trails**: Immutable logs of all AI-generated content

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 🆘 Troubleshooting

### Common Issues

**Ollama not responding**:
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama service
docker compose restart ollama
```

**IPFS upload fails**:
```bash
# Check IPFS daemon
curl http://localhost:5001/api/v0/version

# Restart IPFS
docker compose restart ipfs
```

**Wallet connection issues**:
- Ensure MetaMask is installed and unlocked
- Check network (should work on any EVM chain)
- Clear browser cache and try again

**Build not reproducible**:
- Ensure Docker version consistency
- Check system clock synchronization
- Verify no local modifications to source

---

**Built for AI transparency and verifiable provenance** 🔍✨