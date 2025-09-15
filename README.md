# AI Proof Prototype

> AI content generation with Zero-Knowledge proofs, multi-provider support, and cryptographic verification for transparent, verifiable AI outputs

## 🎯 Project Description

This prototype demonstrates a complete pipeline for creating verifiable AI-generated content with Zero-Knowledge cryptographic proofs. It addresses the growing need for AI transparency and provenance by:

- **Multi-Provider AI**: Supports OpenAI, Anthropic, Together AI, Ollama, and mock providers
- **Zero-Knowledge Proofs**: RISC Zero ZK proofs for deterministic content verification
- **Deterministic Processing**: Keyword extraction with stopword filtering for reproducible results
- **Cryptographic Signing**: EIP-712 wallet signatures for authenticity
- **Decentralized Storage**: IPFS for censorship-resistant data storage
- **Comprehensive Verification**: Multiple verification methods (local, ZK, signature, provenance)

## 🏆 Key Features

**Zero-Knowledge Proof System**:
- **RISC Zero Integration**: Generates cryptographic proofs of deterministic text processing
- **Keyword Extraction**: Deterministic algorithm that extracts top 5 keywords after stopword filtering
- **Hosted Prover Support**: Can use external ZK proof generation services
- **Proof Verification**: Validates ZK receipts and journal data

**Multi-Provider AI Support**:
- **OpenAI**: GPT-4 and other models via API
- **Anthropic**: Claude models via API
- **Together AI**: Open-source models via API
- **Ollama**: Local LLM execution
- **Mock Provider**: Deterministic keyword-based summaries for testing

**Comprehensive Verification**:
- **ZK Proof Verification**: Cryptographic proof of correct processing
- **Signature Verification**: EIP-712 wallet signature validation
- **Content Provenance**: Full audit trail of content generation
- **Local Verification**: Client-side content validation

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- Ethereum wallet (MetaMask, etc.)
- API keys for AI providers (optional)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ai-proof-prototype
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your API keys:

```bash
# AI Provider APIs (at least one required)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
TOGETHER_API_KEY=your_together_key

# IPFS Configuration
NEXT_PUBLIC_IPFS_API_URL=https://api.pinata.cloud
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
PINATA_JWT=your_pinata_jwt

# ZK Prover (optional)
PROVER_URL=http://localhost:8080
PROVER_TIMEOUT_MS=30000
PROVER_RETRIES=3

# Ollama (optional, for local AI)
OLLAMA_API_URL=http://localhost:11434
```

### 3. Install and Run

```bash
# Install dependencies
npm install

# Start the application
npm run dev

# Optional: Start mock prover for ZK testing
node mock-prover-server.js

# Access the app
open http://localhost:3000
```

### 4. Docker Setup (Alternative)

```bash
# Start all services (app, Ollama, IPFS)
docker compose up -d

# Access the app
open http://localhost:3000
```

## 📱 How to Use

### Content Generation

1. **Connect Wallet**: Click "Connect Wallet" and approve MetaMask connection
2. **Select Provider**: Choose from OpenAI, Anthropic, Together AI, Ollama, or Mock
3. **Enter Text**: Type or paste text you want to summarize
4. **Generate Content**: Click "Generate Summary" to start the process:
   - 🤖 AI generates summary using selected provider
   - 🔍 ZK proof generated for deterministic keyword extraction
   - 🔐 Content encrypted and stored on IPFS
   - ✍️ Cryptographic signature created with your wallet
5. **Get Results**: Multiple CIDs are displayed:
   - **Signed Provenance CID**: Complete provenance data
   - **Journal CID**: ZK proof journal with keywords
   - **Proof CID**: ZK cryptographic proof

### Content Verification

1. **Switch to Verify Tab**: Click "🔍 Verify Content"
2. **Enter CIDs**: Paste the CIDs you want to verify
3. **Run Verification**: Choose from multiple verification methods:
   - **Simple Verification**: Basic content validation
   - **Full Verification**: Complete ZK + signature verification
   - **CID Verification**: Multi-CID cross-validation
4. **View Results**: See detailed verification status and provenance information

## 🔍 Verification System

### Multiple Verification Methods

**1. ZK Proof Verification**
```bash
# Verify ZK proof and journal
curl -X POST http://localhost:3000/api/verify-zk \
  -H "Content-Type: application/json" \
  -d '{"journalCid": "QmJournal...", "proofCid": "QmProof..."}'
```

**2. Signature Verification**
```bash
# Verify EIP-712 signature
curl -X POST http://localhost:3000/api/verify-signature \
  -H "Content-Type: application/json" \
  -d '{"signatureCid": "QmSignature..."}'
```

**3. Content Provenance Verification**
```bash
# Full provenance verification
curl -X POST http://localhost:3000/api/verify-provenance \
  -H "Content-Type: application/json" \
  -d '{"provenanceCid": "QmProvenance..."}'
```

### What Each Verifier Checks

**ZK Verification**:
✅ **Proof Validity**: Cryptographic proof verification  
✅ **Journal Integrity**: Keyword extraction correctness  
✅ **Input/Output Hashes**: Content integrity validation  
✅ **Program Hash**: Correct ZK circuit execution  

**Signature Verification**:
✅ **EIP-712 Signature**: Cryptographic proof of signer identity  
✅ **Wallet Address**: Signer authentication  
✅ **Timestamp Verification**: Chronological ordering  
✅ **Message Integrity**: Signed data consistency  

**Provenance Verification**:
✅ **Model Hash**: AI model and parameters used  
✅ **Provider Verification**: AI service authentication  
✅ **Content Chain**: Full audit trail validation  
✅ **IPFS Integrity**: Decentralized storage verification  

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Wallet**: wagmi + viem + RainbowKit
- **AI Providers**: OpenAI, Anthropic, Together AI, Ollama, Mock
- **ZK Proofs**: RISC Zero + Rust guest programs
- **Crypto**: Web Crypto API (AES-GCM, PBKDF2) + EIP-712
- **Storage**: IPFS (Pinata, local nodes)
- **Build**: Docker + Docker Compose

### Data Flow

```
[User Text] → [AI Provider] → [Summary]
     ↓
[ZK Keyword Extraction] → [Generate Proof]
     ↓
[Encrypt Content] → [Upload to IPFS]
     ↓
[EIP-712 Sign] → [Store Provenance]
     ↓
[Multiple CIDs: Provenance, Journal, Proof]
```

### ZK Processing Pipeline

```
[Input Text] → [Normalize & Filter] → [Extract Keywords]
     ↓
[Sort by Frequency] → [Take Top 5] → [Generate Hashes]
     ↓
[Create Journal] → [ZK Proof Generation] → [Verification]
```

### File Structure

```
/app
  /components/
    WalletBox.tsx               # Wallet connection UI
    CidVerificationPanel.tsx    # Multi-CID verification
    SimpleVerificationPanel.tsx # Basic verification
    VerificationPanel.tsx       # Advanced verification
    OutputArea.tsx              # Content display
    ShareModal.tsx              # Content sharing
  /api/
    summarize/route.ts          # Multi-provider AI integration
    verify-zk/route.ts          # ZK proof verification
    verify-signature/route.ts   # EIP-712 verification
    verify-provenance/route.ts  # Content provenance
    verify-content/route.ts     # General verification
    publish/route.ts            # IPFS publishing
  page.tsx                      # Main tabbed UI
  layout.tsx                    # App layout
  providers.tsx                 # wagmi/RainbowKit setup

/api
  providers.ts                  # Multi-provider abstraction
  prover.ts                     # ZK prover integration
  crypto.ts                     # Encryption utilities
  ipfs.ts                       # IPFS client
  verify.ts                     # Verification utilities
  types.ts                      # TypeScript definitions

/zk
  /guest/src/main.rs           # ZK guest program (keyword extraction)
  /host/src/main.rs            # ZK host program
  /methods/                     # ZK method definitions
  Cargo.toml                    # Rust dependencies

/scripts
  verify.sh                     # Shell verification script
  verify.ps1                    # PowerShell verification
  verify-signature.js           # EIP-712 signature checker

mock-prover-server.js           # Local ZK prover for testing
docker-compose.yml              # Multi-service setup
package.json                    # Dependencies
.env.example                    # Environment variables
```

## 🔐 Security & Cryptography

### Zero-Knowledge Proof System

**RISC Zero Integration**:
- **Guest Program**: Rust code running in ZK environment
- **Deterministic Processing**: Same input always produces same output
- **Keyword Extraction**: Top 5 keywords after stopword filtering
- **Cryptographic Proofs**: Verifiable without revealing input

**ZK Journal Structure**:
```json
{
  "inputHash": "sha256:...",
  "outputHash": "sha256:...", 
  "programHash": "...",
  "keywords": [
    {"word": "example", "count": 3},
    {"word": "keyword", "count": 2}
  ]
}
```

### EIP-712 Typed Data Schema

```typescript
const domain = {
  name: "AIProof",
  version: "1",
  chainId: chainId || 1,
  verifyingContract: "0x0000000000000000000000000000000000000000"
};

const types = {
  SaveProof: [
    { name: "cid", type: "string" },      // IPFS CID of provenance data
    { name: "modelHash", type: "string" }, // Hash of AI model + params
    { name: "timestamp", type: "string" }  // ISO timestamp
  ]
};
```

### Encryption & Hashing

**Content Encryption**:
1. **Key Derivation**: `signature_hex → SHA256 → PBKDF2 → AES-GCM key`
2. **Encryption**: `AES-GCM-256` with random IV
3. **Storage**: `IV + ciphertext` uploaded to IPFS

**Model Hash Calculation**:
```typescript
// Deterministic hash of model name + parameters
const modelString = JSON.stringify({ model, params }, Object.keys({ model, params }).sort());
const modelHash = SHA256(modelString);
```

**Content Hashing**:
```typescript
// SHA-256 hash for content integrity
const contentHash = SHA256(originalContent);
const summaryHash = SHA256(generatedSummary);
```

## 🌐 IPFS Storage Schema

### Signed Provenance Data
```json
{
  "contentProvenance": {
    "summary": "AI-generated summary text",
    "model": "gpt-4o-mini",
    "modelHash": "abc123...",
    "params": { "temperature": 0.3 },
    "provider": "openai",
    "signer": "0x742d35Cc6634C0532925a3b8D4C9db96590b5b8c",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "originalTextHash": "def456...",
    "summaryHash": "789abc...",
    "encryptedContentCid": "QmEncrypted123...",
    "journalCid": "QmJournal456...",
    "proofCid": "QmProof789..."
  },
  "signature": {
    "signature": "0x1234567890abcdef...",
    "domain": { /* EIP-712 domain */ },
    "types": { /* EIP-712 types */ },
    "value": { /* SaveProof message */ },
    "signer": "0x742d35Cc6634C0532925a3b8D4C9db96590b5b8c",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### ZK Journal Data
```json
{
  "inputHash": "sha256:b8d120ac8b2f4c24...",
  "outputHash": "sha256:2e3302d81a95b227...",
  "programHash": "936679771774db418fa375bcbc7ff30971ade999...",
  "keywords": [
    { "word": "generation", "count": 3 },
    { "word": "proof", "count": 2 },
    { "word": "content", "count": 2 },
    { "word": "verification", "count": 1 },
    { "word": "cryptographic", "count": 1 }
  ]
}
```

### ZK Proof Data
```
[Binary RISC Zero proof data]
- Receipt verification data
- Cryptographic proof of correct execution
- Journal commitment proof
```

### Encrypted Content
```
[12-byte IV][Variable-length AES-GCM ciphertext]
- Original input text (encrypted)
- Decryption key derived from wallet signature
```

## 🔧 Configuration

### Environment Variables

```bash
# AI Provider APIs
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
TOGETHER_API_KEY=your_together_key

# IPFS Configuration
NEXT_PUBLIC_IPFS_API_URL=https://api.pinata.cloud
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
PINATA_JWT=your_pinata_jwt

# ZK Prover Configuration
PROVER_URL=http://localhost:8080
PROVER_TIMEOUT_MS=30000
PROVER_RETRIES=3

# Ollama Configuration (optional)
OLLAMA_API_URL=http://localhost:11434

# Wallet Support
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_ALCHEMY_ID=your_alchemy_key
```

### Supported AI Providers & Models

**OpenAI**:
- `gpt-4o-mini` (default)
- `gpt-4o`
- `gpt-3.5-turbo`

**Anthropic**:
- `claude-3-haiku-20240307` (default)
- `claude-3-sonnet-20240229`
- `claude-3-opus-20240229`

**Together AI**:
- `meta-llama/Meta-Llama-3-8B-Instruct-Turbo` (default)
- `mistralai/Mixtral-8x7B-Instruct-v0.1`
- `NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO`

**Ollama** (local):
- `llama3` (~4.7GB)
- `qwen2.5:3b` (~1.9GB)
- Any Ollama-compatible model

**Mock Provider**:
- Deterministic keyword-based summaries
- No external dependencies
- Perfect for testing and development

## 🧪 Testing & Development

### Run Tests

```bash
# Install dependencies
npm install

# Lint code
npm run lint

# Build for production
npm run build

# Start development server
npm run dev

# Test ZK prover
node test-hosted-prover.js

# Test publish flow
node test-publish-flow.js

# Test verification
node test-verification.js
```

### Development Workflow

1. **Setup Environment**: Configure `.env` with API keys
2. **Start Services**: Run `npm run dev` and `node mock-prover-server.js`
3. **Test Features**: Use the web interface to generate and verify content
4. **ZK Development**: Modify Rust code in `/zk/guest/src/main.rs`
5. **Build ZK**: Use `cargo build` in the `/zk` directory
6. **Integration Testing**: Test full pipeline with real providers

### ZK Development

```bash
# Navigate to ZK directory
cd zk

# Build ZK programs
cargo build

# Run ZK host program
cargo run --bin host

# Test with sample input
echo "test content" > test_input.txt
cargo run --bin host -- test_input.txt
```

## 🚀 Deployment Options

### Vercel Deployment

**Recommended for frontend-only deployment**:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - PINATA_JWT
# - NEXT_PUBLIC_IPFS_GATEWAY
```

**Note**: ZK proof generation requires external prover service for Vercel deployment.

### Docker Deployment

```bash
# Build production image
docker build -t ai-proof-app .

# Run with environment variables
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your_key \
  -e PINATA_JWT=your_jwt \
  ai-proof-app
```

### Self-Hosted Setup

```bash
# Full stack with all services
docker compose up -d

# Access services:
# - App: http://localhost:3000
# - IPFS: http://localhost:5001
# - Ollama: http://localhost:11434
```

## 🔮 Future Extensions

### Enhanced ZK Features

- **Advanced Circuits**: More complex text analysis in ZK
- **Privacy-Preserving AI**: Generate summaries without revealing inputs
- **Batch Processing**: Multiple content verification in single proof
- **Cross-Chain Verification**: Multi-blockchain proof validation

### AI Provider Expansion

- **Hugging Face Integration**: Open-source model support
- **Custom Model Support**: Private model deployment
- **Multi-Modal AI**: Image and video content processing
- **Real-Time Streaming**: Live content generation and verification

### Enterprise Features

- **Multi-Signer DAO**: Require multiple signatures for content approval
- **Governance Integration**: Link to on-chain voting records
- **Audit Trails**: Complete immutable logs of all AI operations
- **Compliance Tools**: Regulatory reporting and data retention

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

**AI Provider API Errors**:
```bash
# Check API key configuration
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models
```

**ZK Proof Generation Fails**:
```bash
# Check mock prover is running
curl http://localhost:8080/health

# Start mock prover
node mock-prover-server.js

# Check ZK build
cd zk && cargo build
```

**IPFS Upload Issues**:
```bash
# Test Pinata connection
curl -H "Authorization: Bearer $PINATA_JWT" \
  https://api.pinata.cloud/data/testAuthentication

# Check IPFS gateway
curl https://gateway.pinata.cloud/ipfs/QmTest...
```

**Wallet Connection Problems**:
- Ensure MetaMask is installed and unlocked
- Check network (works on any EVM chain)
- Clear browser cache and try again
- Verify wallet has sufficient ETH for gas

**Verification Failures**:
- Check all CIDs are valid IPFS hashes
- Ensure content hasn't been modified
- Verify signature matches original signer
- Check ZK proof and journal consistency

**Development Issues**:
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check environment variables
cat .env
```

---

**Built for AI transparency and verifiable provenance** 🔍✨