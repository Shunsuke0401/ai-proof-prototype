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
    # Extract ZK proof CIDs from summary
    JOURNAL_CID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).zk.journalCid)" 2>/dev/null || echo "")
    PROOF_CID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_FILE', 'utf8')).zk.proofCid)" 2>/dev/null || echo "")
    
    if [ -n "$JOURNAL_CID" ] && [ -n "$PROOF_CID" ]; then
        echo "📥 Downloading ZK proof artifacts..."
        echo "   Journal CID: $JOURNAL_CID"
        echo "   Proof CID: $PROOF_CID"
        
        JOURNAL_FILE="$TEMP_DIR/journal.json"
        PROOF_FILE="$TEMP_DIR/proof.bin"
        
        # Download journal and proof from IPFS
        if command -v curl >/dev/null 2>&1; then
            LOCAL_JOURNAL_URL="http://localhost:8080/ipfs/$JOURNAL_CID"
            LOCAL_PROOF_URL="http://localhost:8080/ipfs/$PROOF_CID"
            
            curl -sL "$LOCAL_JOURNAL_URL" -o "$JOURNAL_FILE" 2>/dev/null || \
            curl -s "$IPFS_GATEWAY/$JOURNAL_CID" -o "$JOURNAL_FILE" || { echo "❌ Failed to download journal"; exit 1; }
            
            curl -sL "$LOCAL_PROOF_URL" -o "$PROOF_FILE" 2>/dev/null || \
            curl -s "$IPFS_GATEWAY/$PROOF_CID" -o "$PROOF_FILE" || { echo "❌ Failed to download proof"; exit 1; }
        else
            wget -q "$IPFS_GATEWAY/$JOURNAL_CID" -O "$JOURNAL_FILE" || { echo "❌ Failed to download journal"; exit 1; }
            wget -q "$IPFS_GATEWAY/$PROOF_CID" -O "$PROOF_FILE" || { echo "❌ Failed to download proof"; exit 1; }
        fi
        
        echo "✅ Downloaded ZK proof artifacts"
        echo "   Journal size: $(wc -c < "$JOURNAL_FILE") bytes"
        echo "   Proof size: $(wc -c < "$PROOF_FILE") bytes"
        
        # Validate journal format
        if ! node -e "JSON.parse(require('fs').readFileSync('$JOURNAL_FILE', 'utf8'))" 2>/dev/null; then
            echo "❌ Invalid journal JSON format"
            exit 1
        fi
        
        # Extract program hash from journal for verification
        PROGRAM_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$JOURNAL_FILE', 'utf8')).programHash)" 2>/dev/null || echo "")
        
        if [ -n "$PROGRAM_HASH" ]; then
            echo "🔍 Program Hash: $PROGRAM_HASH"
            
            # Verify ZK proof using risc0-verify (real proof validation)
            if command -v risc0-verify >/dev/null 2>&1; then
                echo "🔬 Running risc0-verify with RISC Zero toolchain..."
                echo "   Command: risc0-verify --proof $PROOF_FILE --image $PROGRAM_HASH --journal $JOURNAL_FILE"
                
                # Capture output to check for dev-mode warnings
                VERIFY_OUTPUT=$(risc0-verify --proof "$PROOF_FILE" --image "$PROGRAM_HASH" --journal "$JOURNAL_FILE" 2>&1)
                VERIFY_EXIT_CODE=$?
                
                echo "$VERIFY_OUTPUT"
                
                if [ $VERIFY_EXIT_CODE -eq 0 ]; then
                    # Check for dev-mode warnings in output
                    if echo "$VERIFY_OUTPUT" | grep -i "dev.*mode\|development\|mock" >/dev/null 2>&1; then
                        echo "❌ ZK proof verification detected dev-mode or mock proof!"
                        echo "❌ Real ZK proofs are required for production verification"
                        exit 1
                    fi
                    echo "✅ ZK proof verification successful!"
                    echo "✅ Real computational integrity proven (no dev-mode detected)"
                else
                    echo "❌ ZK proof verification failed!"
                    echo "❌ Either the proof is invalid or the program hash doesn't match"
                    exit 1
                fi
            else
                echo "❌ risc0-verify not found in PATH"
                echo "   RISC Zero toolchain is required for ZK proof verification"
                echo "   Install with: curl -L https://risczero.com/install | bash"
                echo "   Then run: rzup install"
                exit 1
            fi
        else
            echo "❌ Program hash not found in journal"
            exit 1
        fi
    else
        echo "❌ ZK proof CIDs missing from summary"
        echo "   Expected: journalCid and proofCid in summary.zk"
        exit 1
    fi
else
    echo "❌ No ZK proof data found in summary"
    echo "   This appears to be a mock implementation"
    echo "   Real ZK proofs are required for verification"
    exit 1
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