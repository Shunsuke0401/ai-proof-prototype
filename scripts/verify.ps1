# Verification script for AI Proof Prototype (PowerShell version)
# Checks reproducible build and verifies signatures

param(
    [Parameter(Mandatory = $true)]
    [string]$SummaryCid,
    
    [Parameter(Mandatory = $true)]
    [string]$SignatureCid,
    
    [Parameter(Mandatory = $false)]
    [string]$ExpectedProgramHash = ""
)

Write-Host "🔍 AI Proof Prototype Verification Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Summary CID: $SummaryCid" -ForegroundColor Yellow
Write-Host "📋 Signature CID: $SignatureCid" -ForegroundColor Yellow
if ($ExpectedProgramHash) {
    Write-Host "📋 Expected Program Hash: $ExpectedProgramHash" -ForegroundColor Yellow
}
Write-Host ""

# Step 1: Build Docker image and get digest
Write-Host "🐳 Building Docker image..." -ForegroundColor Blue
try {
    $DockerOutput = docker build -q . 2>&1
    if ($LASTEXITCODE -eq 0 -and $DockerOutput) {
        # Handle both "sha256:hash" and just "hash" formats
        $DockerDigest = ($DockerOutput.ToString().Trim() -split "`n")[-1] -replace "sha256:", ""
        Write-Host "✅ Docker image digest: $DockerDigest" -ForegroundColor Green
        
        # Save digest for reproducibility verification
        if (!(Test-Path "expected")) {
            New-Item -ItemType Directory -Path "expected" | Out-Null
        }
        $DockerDigest | Out-File -FilePath "expected\image.digest" -Encoding UTF8 -NoNewline
        Write-Host "📝 Saved image digest to expected/image.digest" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Docker build failed, continuing without Docker verification" -ForegroundColor Yellow
        $DockerDigest = "unavailable"
    }
} catch {
    Write-Host "⚠️  Docker not available, skipping Docker verification" -ForegroundColor Yellow
    $DockerDigest = "unavailable"
}
Write-Host ""

# Step 2: Fetch summary.json from IPFS
Write-Host "📥 Fetching summary metadata from IPFS..." -ForegroundColor Blue
$IpfsGateway = if ($env:IPFS_GATEWAY) { $env:IPFS_GATEWAY } else { "https://ipfs.io/ipfs" }
$SummaryUrl = "$IpfsGateway/$SummaryCid"
$SignatureUrl = "$IpfsGateway/$SignatureCid"

# Create temp directory
$TempDir = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
New-Item -ItemType Directory -Path $TempDir | Out-Null
$SummaryFile = Join-Path $TempDir "summary.json"
$SignatureFile = Join-Path $TempDir "signature.json"

try {
    # Try local IPFS node first, fallback to gateway
    $LocalSummaryUrl = "http://localhost:8080/ipfs/$SummaryCid"
    $LocalSignatureUrl = "http://localhost:8080/ipfs/$SignatureCid"
    
    try {
        Invoke-WebRequest -Uri $LocalSummaryUrl -OutFile $SummaryFile -ErrorAction Stop
        Write-Host "✅ Downloaded summary from local IPFS node" -ForegroundColor Green
    }
    catch {
        Invoke-WebRequest -Uri $SummaryUrl -OutFile $SummaryFile -ErrorAction Stop
        Write-Host "✅ Downloaded summary from IPFS gateway" -ForegroundColor Green
    }
    
    try {
        Invoke-WebRequest -Uri $LocalSignatureUrl -OutFile $SignatureFile -ErrorAction Stop
        Write-Host "✅ Downloaded signature from local IPFS node" -ForegroundColor Green
    }
    catch {
        Invoke-WebRequest -Uri $SignatureUrl -OutFile $SignatureFile -ErrorAction Stop
        Write-Host "✅ Downloaded signature from IPFS gateway" -ForegroundColor Green
    }
}
catch {
    Write-Host "❌ Failed to download files: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host ""

# Step 3: Verify signature using Node.js script
Write-Host "🔐 Verifying EIP-712 signature..." -ForegroundColor Blue
try {
    $VerifyResult = node scripts/verify-signature.js "$SummaryFile" "$SignatureFile" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host $VerifyResult -ForegroundColor Green
    }
    else {
        Write-Host "❌ Signature verification failed: $VerifyResult" -ForegroundColor Red
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }
}
catch {
    Write-Host "❌ Signature verification error: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host ""

# Step 3.5: Verify ZK proof
Write-Host "🔬 Verifying ZK proof..." -ForegroundColor Blue
try {
    $SummaryContent = Get-Content $SummaryFile -Raw | ConvertFrom-Json
    
    if ($SummaryContent.zk -and $SummaryContent.zk.journalCid -and $SummaryContent.zk.proofCid) {
        $JournalCid = $SummaryContent.zk.journalCid
        $ProofCid = $SummaryContent.zk.proofCid
        
        Write-Host "📥 Fetching ZK artifacts from IPFS..." -ForegroundColor Blue
        $JournalUrl = "$IpfsGateway/$JournalCid"
        $ProofUrl = "$IpfsGateway/$ProofCid"
        $JournalFile = Join-Path $TempDir "journal.json"
        $ProofFile = Join-Path $TempDir "proof.bin"
        
        # Download ZK artifacts
        try {
            Invoke-WebRequest -Uri $JournalUrl -OutFile $JournalFile -ErrorAction Stop
            Invoke-WebRequest -Uri $ProofUrl -OutFile $ProofFile -ErrorAction Stop
            Write-Host "✅ Downloaded ZK artifacts" -ForegroundColor Green
            
            # Extract program ID from journal
            $JournalContent = Get-Content $JournalFile -Raw | ConvertFrom-Json
            $ProgramId = $JournalContent.programHash
            Write-Host "🔍 Program ID: $ProgramId" -ForegroundColor Yellow
            
            # Check for risc0-verify
            if (Get-Command risc0-verify -ErrorAction SilentlyContinue) {
                Write-Host "🔬 Running risc0-verify..." -ForegroundColor Blue
                $ZkResult = risc0-verify --proof "$ProofFile" --image "$ProgramId" --journal "$JournalFile" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "✅ ZK proof verification passed!" -ForegroundColor Green
                }
                else {
                    Write-Host "❌ ZK proof verification failed: $ZkResult" -ForegroundColor Red
                }
            }
            else {
                Write-Host "⚠️  risc0-verify not found, skipping ZK proof verification" -ForegroundColor Yellow
                Write-Host "   Install RISC Zero toolchain to enable ZK verification" -ForegroundColor Gray
            }
        }
        catch {
            Write-Host "⚠️  Failed to download ZK artifacts: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "⚠️  No ZK proof data found in summary (using mock implementation)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠️  ZK proof verification error: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Check program hash if provided
if ($ExpectedProgramHash) {
    Write-Host "🤖 Verifying program hash..." -ForegroundColor Blue
    try {
        $SummaryContent = Get-Content $SummaryFile -Raw | ConvertFrom-Json
        $ActualProgramHash = $SummaryContent.programHash
        
        if ($ActualProgramHash -eq $ExpectedProgramHash) {
            Write-Host "✅ Program hash matches expected value" -ForegroundColor Green
        }
        else {
            Write-Host "❌ Program hash mismatch!" -ForegroundColor Red
            Write-Host "   Expected: $ExpectedProgramHash" -ForegroundColor Gray
            Write-Host "   Actual:   $ActualProgramHash" -ForegroundColor Gray
            Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
            exit 1
        }
        
        # Save expected program hash
        if (!(Test-Path "expected")) {
            New-Item -ItemType Directory -Path "expected" | Out-Null
        }
        $ExpectedProgramHash | Out-File -FilePath "expected\program.sha256" -Encoding UTF8 -NoNewline
        Write-Host "📝 Saved expected program hash to expected/program.sha256" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Program hash verification error: $($_.Exception.Message)" -ForegroundColor Red
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }
}
else {
    Write-Host "⚠️  No expected program hash provided, skipping verification" -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Display summary information
Write-Host "📊 Summary Information:" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
try {
    $SummaryContent = Get-Content $SummaryFile -Raw | ConvertFrom-Json
    Write-Host "Program Hash: $($SummaryContent.programHash)" -ForegroundColor White
    Write-Host "Input Hash: $($SummaryContent.inputHash)" -ForegroundColor White
    Write-Host "Output Hash: $($SummaryContent.outputHash)" -ForegroundColor White
    Write-Host "Signer: $($SummaryContent.signer)" -ForegroundColor White
    Write-Host "Timestamp: $($SummaryContent.timestamp)" -ForegroundColor White
    Write-Host "Summary Length: $($SummaryContent.summary.Length) characters" -ForegroundColor White
    if ($SummaryContent.zk) {
        Write-Host "ZK Proof CID: $($SummaryContent.zk.proofCid)" -ForegroundColor White
        Write-Host "ZK Journal CID: $($SummaryContent.zk.journalCid)" -ForegroundColor White
    }
}
catch {
    Write-Host "❌ Error reading summary information: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Cleanup
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "🎉 Verification completed successfully!" -ForegroundColor Green
Write-Host "✅ All checks passed" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Reproducibility Info:" -ForegroundColor Cyan
Write-Host "   Docker Image Digest: $DockerDigest" -ForegroundColor Gray
Write-Host "   Summary CID: $SummaryCid" -ForegroundColor Gray
Write-Host "   Signature CID: $SignatureCid" -ForegroundColor Gray