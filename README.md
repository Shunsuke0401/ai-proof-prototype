# AI Proof Prototype

> Verifiable AI output provenance: generate content, sign a single EIP-712 provenance record, publish, and let anyone verify origin & integrity from one CID.

## 🎯 What It Does

Creates a cryptographically signed provenance envelope for AI-generated text. The envelope captures:

| Field                 | Purpose                                      |
| --------------------- | -------------------------------------------- | ------------------------------------------ |
| modelId / modelHash   | Identify the model used (or mock)            |
| promptHash            | SHA-256 of original input text               |
| outputHash            | SHA-256 of model output summary              |
| paramsHash            | Normalized generation params (deterministic) |
| contentCid            | CID of the generated summary text (plain)    |
| keywordsHash          | (Mock ZK) hash of extracted keywords list    |
| programHash           | Placeholder / future ZK program binding      |
| journalCid / proofCid | (Optional) ZK journal + proof (mock today)   |
| timestamp             | Millisecond epoch of creation                |
| attestationStrategy   | 'none'                                       | 'zk-keywords-mock' (future: 'zk-keywords') |

All of this is signed as a single EIP-712 `ContentProvenance` struct. The signed bundle (domain + types + provenance + signature + optional promptCid) is stored as one JSON object on IPFS: **“Signed Provenance CID”**.

## ✅ Reproducibility & Minimal Verification

- Deterministic build: pinned Node version, `npm ci`, reproducible Docker multi-stage.
- Minimal verification: `/api/verify-provenance?cid=<signedProvenanceCid>` recomputes hashes & recovers signer.
- Issues vs Warnings classification: hard failures (signature mismatch, hash mismatch) vs soft signals (missing optional proof, mock mode).

## 🚀 Quick Start (Local Docker)

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
docker compose up -d
open http://localhost:3000
```

### 3. Alternative: Local Development

```bash
npm install
npm run dev
```

## 📱 User Flow (Current)

1. Connect wallet (RainbowKit + wagmi)
2. Enter prompt text
3. Click Generate & Sign
4. Backend:

- Produces summary (mock provider today)
- Computes hashes & (optional mock) keyword extraction
- Creates unsigned provenance object

5. Wallet signs EIP-712 `ContentProvenance`
6. Backend stores signed envelope JSON → returns **Signed Provenance CID**
7. Paste Signed Provenance CID into Verification panel to inspect authenticity & integrity

## 🔍 Verification Endpoint

`GET /api/verify-provenance?cid=<signedProvenanceCid>`

Checks performed:
| Category | Check |
|----------|-------|
| Signature | EIP-712 recover vs claimed signer |
| Hashes | Recompute prompt/output/keywords hashes |
| Structural | Required fields present & types pruned |
| ZK (mock) | If attestationStrategy=zk-keywords-mock, verify internal mock consistency |
| Integrity | contentCid fetch & outputHash match |
| Optional | promptCid if present validates promptHash |

Issues block verification; warnings are informational.

## 🏗️ Architecture Overview

- **Framework**: Next.js App Router (Node runtime)
- **Signing**: EIP-712 single struct `ContentProvenance`
- **Storage**: IPFS (mock mode by default in Fly deploy via `IPFS_MODE=mock`)
- **Hashing**: SHA-256 (hex 0x-prefixed)
- **ZK Layer**: Placeholder (mock keyword extraction; future RISC Zero receipt)
- **Deployment**: Docker (local) / Fly.io (public)

### Data Flow

```
Prompt → (Mock Provider) → Summary
  ↓
Compute hashes (prompt / output / params / keywords)
  ↓
Unsigned provenance JSON
  ↓ (wallet sign EIP-712)
Signed envelope (provenance + signature + domain + types + optional promptCid)
  ↓
Store envelope JSON (Signed Provenance CID)
```

### Key Files

```
/app
  /components/WalletBox.tsx     # Wallet connection UI
  /api/summarize/route.ts       # Generate summary + provenance (mock or future real)
  /api/publish/route.ts         # Accept signature & persist envelope
  /api/verify-provenance/route.ts # Full verification logic
  page.tsx                      # Main UI
  layout.tsx                    # App layout
  providers.tsx                 # wagmi/RainbowKit setup
  globals.css                   # Tailwind styles

 /api
  ipfs.ts                       # IPFS (mock/real) helper
  providers.ts                  # Placeholder providers (mock active)
  types.ts                      # EIP-712 domain & struct

 /scripts
  verify.sh                     # (Legacy) signature/metadata script (may diverge)
  verify-signature.js           # Basic EIP-712 verification helper

/expected
  model.sha256                  # Expected model hash
  image.digest                  # Docker image digest

Dockerfile                      # Reproducible build config
docker-compose.yml              # Multi-service setup
package.json                    # Dependencies (pinned versions)
.env.example                    # Environment variables
```

## 🔐 EIP-712 Provenance Structure

```typescript
// Domain & types (simplified)
domain = {
  name: "AIProof",
  version: "1",
  chainId: 1,
  verifyingContract: "0x0000000000000000000000000000000000000000",
};
types = {
  ContentProvenance: [
    { name: "version", type: "uint256" },
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
    { name: "proofCid", type: "string" },
  ],
};
```

## 📦 Signed Provenance Envelope (Stored JSON)

```jsonc
{
  "provenance": { /* ContentProvenance fields */ },
  "domain": { "name": "AIProof", "version": "1", ... },
  "types": { "ContentProvenance": [ /* struct */ ] },
  "primaryType": "ContentProvenance",
  "signature": "0x...",
  "signer": "0x...",
  "promptCid": "Qm..." // optional
}
```

## 🔧 Configuration

Key env vars:
| Variable | Purpose | Default |
|----------|---------|---------|
| IPFS_MODE | `mock` to generate deterministic pseudo CIDs (no real retrieval) | mock (Fly) |
| NEXT_PUBLIC_IPFS_GATEWAY | Gateway base for fetching CIDs | https://ipfs.io/ipfs |
| IPFS_GATEWAYS | Comma list fallback gateways | ipfs.io, cloudflare |
| ZK_HOST_ENABLED | Enable real ZK host execution (future) | 0 |
| ZK_HOST_BINARY | Override zkhost path | /app/bin/zkhost |

If you add a real IPFS API node set: `NEXT_PUBLIC_IPFS_API_URL`.

## 🧪 Development Workflow

1. `docker compose up` (or `npm run dev` for hot reload)
2. Generate & sign a provenance
3. Copy Signed Provenance CID
4. Verify via UI or `/api/verify-provenance?cid=...`
5. (Optional) `scripts/verify-signature.js` for raw signature recovery tests

## 🚀 Deployment (Fly.io)

```bash
fly auth login
fly deploy --build-arg BUILD_ZK=0
fly open
```

Mock mode caveat: CIDs are not resolvable on public gateways. For real retrieval integrate a pinning service (web3.storage, Pinata) and switch off `IPFS_MODE=mock`.

## 🛣 Roadmap

- Real model provider integration (remove mock)
- RISC Zero verification (journal/proof validation & programHash binding)
- Trust tiers (Signature-only / Structural-ZK / Full-ZK)
- Prompt privacy mode (omit promptCid or store salted hash)
- Revocation / supersession mechanism
- Optional on-chain anchoring of hash commitments

## ⚠️ Current Limitations

- Mock summary provider
- Mock ZK (keywords only, unverifiable)
- Mock IPFS mode does not allow third-party retrieval
- No encryption layer (intentional simplification vs early versions)
- Single-user UX (no multi-tenant auth)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 🆘 Troubleshooting

| Symptom                   | Likely Cause                     | Fix                                      |
| ------------------------- | -------------------------------- | ---------------------------------------- |
| Signature mismatch        | Wrong primaryType/types ordering | Ensure only `ContentProvenance` in types |
| contentCid mismatch       | Summary altered after hash       | Regenerate and re-sign                   |
| Gateway fetch timeout     | Public gateway slowness          | Add more gateways in `IPFS_GATEWAYS`     |
| ZK fields zeroed          | Running mock                     | Set future real ZK mode when implemented |
| CID not found (mock mode) | Using mock CIDs                  | Deploy real IPFS API + disable mock      |

Logs inside container: `docker compose logs -f app`

---

**Built for AI transparency and verifiable provenance** 🔍✨
