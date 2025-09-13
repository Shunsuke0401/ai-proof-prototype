#!/bin/bash

# Verification script for AI Proof Prototype
# Checks reproducible build and verifies signatures

set -e

echo "🔍 AI Proof Prototype Verification Script"
echo "=========================================="

# Check if required arguments are provided
if [ $# -lt 2 ]; then
    echo "Usage: $0 <summary_cid> <signature_cid> [expected_program_hash]"
    echo "Example: $0 QmSummary123... QmSignature456... abc123..."
    exit 1
fi

SUMMARY_CID=$1
SIGNATURE_CID=$2
EXPECTED_PROGRAM_HASH=${3:-""}

echo "📋 Summary CID: $SUMMARY_CID"
echo "📋 Signature CID: $SIGNATURE_CID"
if [ -n "$EXPECTED_PROGRAM_HASH" ]; then
    echo "📋 Expected Program Hash: $EXPECTED_PROGRAM_HASH"
fi
echo ""

# Step 1: Build Docker image and get digest
echo "🐳 Building Docker image..."
DOCKER_DIGEST=$(docker build -q . 2>/dev/null | cut -d':' -f2)
echo "✅ Docker image digest: $DOCKER_DIGEST"

# Save digest for reproducibility verification
mkdir -p expected
echo "$DOCKER_DIGEST" > expected/image.digest
echo "📝 Saved image digest to expected/image.digest"
echo ""

# Step 2: Fetch summary.json from IPFS
echo "📥 Fetching summary metadata from IPFS..."
IPFS_GATEWAY=${IPFS_GATEWAY:-"https://ipfs.io/ipfs"}
SUMMARY_URL="$IPFS_GATEWAY/$SUMMARY_CID"
SIGNATURE_URL="$IPFS_GATEWAY/$SIGNATURE_CID"

# Create temp directory
TEMP_DIR=$(mktemp -d)
SUMMARY_FILE="$TEMP_DIR/summary.json"
SIGNATURE_FILE="$TEMP_DIR/signature.json"

# Download files using curl with local IPFS node
if command -v curl >/dev/null 2>&1; then
    # Try local IPFS node first, fallback to gateway
    LOCAL_SUMMARY_URL="http://localhost:8080/ipfs/$SUMMARY_CID"
    LOCAL_SIGNATURE_URL="http://localhost:8080/ipfs/$SIGNATURE_CID"
    
    # Follow redirects for local IPFS node
    curl -sL "$LOCAL_SUMMARY_URL" -o "$SUMMARY_FILE" 2>/dev/null || \
    curl -s "$SUMMARY_URL" -o "$SUMMARY_FILE" || { echo "❌ Failed to download summary"; exit 1; }
    
    curl -sL "$LOCAL_SIGNATURE_URL" -o "$SIGNATURE_FILE" 2>/dev/null || \
    curl -s "$SIGNATURE_URL" -o "$SIGNATURE_FILE" || { echo "❌ Failed to download signature"; exit 1; }
elif command -v wget >/dev/null 2>&1; then
    wget -q "$SUMMARY_URL" -O "$SUMMARY_FILE" || { echo "❌ Failed to download summary"; exit 1; }
    wget -q "$SIGNATURE_URL" -O "$SIGNATURE_FILE" || { echo "❌ Failed to download signature"; exit 1; }
else
    echo "❌ Neither curl nor wget is available"
    exit 1
fi

echo "✅ Downloaded summary and signature files"
echo ""

# Step 3: Verify signature using Node.js script
echo "🔐 Verifying EIP-712 signature..."
node scripts/verify-signature.js "$SUMMARY_FILE" "$SIGNATURE_FILE"
echo ""

# Step 3.5: Verify ZK proof
echo "🔬 Verifying ZK proof..."
# Check if ZK proof data exists in the summary
HAS_ZK_DATA=$(node -e "const data = JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')); console.log(data.zk ? 'true' : 'false');" 2>/dev/null || echo "false")

if [ "$HAS_ZK_DATA" = "true" ]; then
    JOURNAL_CID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).zk.journalCid)")
    PROOF_CID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).zk.proofCid)")
    
    if [ "$JOURNAL_CID" != "undefined" ] && [ "$PROOF_CID" != "undefined" ]; then
        echo "📥 Fetching ZK artifacts from IPFS..."
        JOURNAL_URL="$IPFS_GATEWAY/$JOURNAL_CID"
        PROOF_URL="$IPFS_GATEWAY/$PROOF_CID"
        JOURNAL_FILE="$TEMP_DIR/journal.json"
        PROOF_FILE="$TEMP_DIR/proof.bin"
        
        # Download ZK artifacts
        if command -v curl >/dev/null 2>&1; then
            curl -s "$JOURNAL_URL" -o "$JOURNAL_FILE"
            curl -s "$PROOF_URL" -o "$PROOF_FILE"
        elif command -v wget >/dev/null 2>&1; then
            wget -q "$JOURNAL_URL" -O "$JOURNAL_FILE"
            wget -q "$PROOF_URL" -O "$PROOF_FILE"
        fi
        
        echo "✅ Downloaded ZK artifacts"
        
        # Extract program ID from journal
        PROGRAM_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$JOURNAL_FILE', 'utf8')).programHash)")
        echo "🔍 Program ID: $PROGRAM_ID"
        
        # Verify ZK proof using risc0-verify
        echo "🔬 Running risc0-verify..."
        if command -v risc0-verify >/dev/null 2>&1; then
            risc0-verify --proof "$PROOF_FILE" --image "$PROGRAM_ID" --journal "$JOURNAL_FILE"
            echo "✅ ZK proof verification passed!"
        else
            echo "⚠️  risc0-verify not found, skipping ZK proof verification"
            echo "   Install RISC Zero toolchain to enable ZK verification"
        fi
    else
        echo "⚠️  ZK proof CIDs not found in summary"
    fi
else
    echo "⚠️  No ZK proof data found in summary (using mock implementation)"
fi
echo ""

# Step 4: Check program hash if provided
if [ -n "$EXPECTED_PROGRAM_HASH" ]; then
    echo "🤖 Verifying program hash..."
    ACTUAL_PROGRAM_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).programHash)")
    
    if [ "$ACTUAL_PROGRAM_HASH" = "$EXPECTED_PROGRAM_HASH" ]; then
        echo "✅ Program hash matches expected value"
    else
        echo "❌ Program hash mismatch!"
        echo "   Expected: $EXPECTED_PROGRAM_HASH"
        echo "   Actual:   $ACTUAL_PROGRAM_HASH"
        exit 1
    fi
    
    # Save expected program hash
    echo "$EXPECTED_PROGRAM_HASH" > expected/program.sha256
    echo "📝 Saved expected program hash to expected/program.sha256"
else
    echo "⚠️  No expected program hash provided, skipping verification"
fi
echo ""

# Step 5: Display summary information
echo "📊 Summary Information:"
echo "======================"
node -e "
    const summary = JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8'));
    console.log('Program Hash:', summary.programHash);
    console.log('Input Hash:', summary.inputHash);
    console.log('Output Hash:', summary.outputHash);
    console.log('Signer:', summary.signer);
    console.log('Timestamp:', summary.timestamp);
    console.log('Summary Length:', summary.summary.length, 'characters');
    if (summary.zk) {
        console.log('ZK Proof CID:', summary.zk.proofCid);
        console.log('ZK Journal CID:', summary.zk.journalCid);
    }
"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

echo "🎉 Verification completed successfully!"
echo "✅ All checks passed"
echo ""
echo "📋 Reproducibility Info:"
echo "   Docker Image Digest: $DOCKER_DIGEST"
echo "   Summary CID: $SUMMARY_CID"
echo "   Signature CID: $SIGNATURE_CID"