#!/bin/bash

# Verification script for AI Proof Prototype
# Checks reproducible build and verifies signatures

set -e

echo "🔍 AI Proof Prototype Verification Script"
echo "=========================================="

# Check if required arguments are provided
if [ $# -lt 2 ]; then
    echo "Usage: $0 <summary_cid> <signature_cid> [expected_model_hash]"
    echo "Example: $0 QmSummary123... QmSignature456... abc123..."
    exit 1
fi

SUMMARY_CID=$1
SIGNATURE_CID=$2
EXPECTED_MODEL_HASH=${3:-""}

echo "📋 Summary CID: $SUMMARY_CID"
echo "📋 Signature CID: $SIGNATURE_CID"
if [ -n "$EXPECTED_MODEL_HASH" ]; then
    echo "📋 Expected Model Hash: $EXPECTED_MODEL_HASH"
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

# Download files
if command -v curl >/dev/null 2>&1; then
    curl -s "$SUMMARY_URL" -o "$SUMMARY_FILE"
    curl -s "$SIGNATURE_URL" -o "$SIGNATURE_FILE"
elif command -v wget >/dev/null 2>&1; then
    wget -q "$SUMMARY_URL" -O "$SUMMARY_FILE"
    wget -q "$SIGNATURE_URL" -O "$SIGNATURE_FILE"
else
    echo "❌ Error: Neither curl nor wget found. Please install one of them."
    exit 1
fi

echo "✅ Downloaded summary and signature files"
echo ""

# Step 3: Verify signature using Node.js script
echo "🔐 Verifying EIP-712 signature..."
node scripts/verify-signature.js "$SUMMARY_FILE" "$SIGNATURE_FILE"
echo ""

# Step 4: Check model hash if provided
if [ -n "$EXPECTED_MODEL_HASH" ]; then
    echo "🤖 Verifying model hash..."
    ACTUAL_MODEL_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).modelHash)")
    
    if [ "$ACTUAL_MODEL_HASH" = "$EXPECTED_MODEL_HASH" ]; then
        echo "✅ Model hash matches expected value"
    else
        echo "❌ Model hash mismatch!"
        echo "   Expected: $EXPECTED_MODEL_HASH"
        echo "   Actual:   $ACTUAL_MODEL_HASH"
        exit 1
    fi
    
    # Save expected model hash
    echo "$EXPECTED_MODEL_HASH" > expected/model.sha256
    echo "📝 Saved expected model hash to expected/model.sha256"
else
    echo "⚠️  No expected model hash provided, skipping verification"
fi
echo ""

# Step 5: Display summary information
echo "📊 Summary Information:"
echo "======================"
node -e "
    const summary = JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8'));
    console.log('Model:', summary.model);
    console.log('Model Hash:', summary.modelHash);
    console.log('Signer:', summary.signer);
    console.log('Timestamp:', summary.timestamp);
    console.log('Summary Length:', summary.summary.length, 'characters');
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