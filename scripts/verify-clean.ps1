param(
    [Parameter(Mandatory = $true)][string]$SummaryCid,
    [Parameter(Mandatory = $true)][string]$SignatureCid,
    [Parameter(Mandatory = $false)][string]$ExpectedProgramHash = ""
)

function Write-Section($title, $color = 'Cyan') {
    Write-Host ""; Write-Host $title -ForegroundColor $color
    if ($title -notmatch '===') { Write-Host ('=' * $title.Length) -ForegroundColor $color }
}

function Get-WithFallback {
    param(
        [string]$Primary,
        [string]$Fallback,
        [string]$OutFile,
        [string]$Label
    )
    try {
        Invoke-WebRequest -Uri $Primary -OutFile $OutFile -ErrorAction Stop
        Write-Host "✅ Downloaded $Label from primary" -ForegroundColor Green
    }
    catch {
        Invoke-WebRequest -Uri $Fallback -OutFile $OutFile -ErrorAction Stop
        Write-Host "✅ Downloaded $Label from fallback" -ForegroundColor Green
    }
}

Write-Section "🔍 AI Proof Prototype Verification Script"
Write-Host "📋 Summary CID: $SummaryCid" -ForegroundColor Yellow
Write-Host "📋 Signature CID: $SignatureCid" -ForegroundColor Yellow
if ($ExpectedProgramHash) {
    Write-Host "📋 Expected Program Hash: $ExpectedProgramHash" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "🐳 Building Docker image..." -ForegroundColor Blue
$DockerDigest = 'unavailable'
try {
    $DockerOutput = docker build -q . 2>$null
    if ($LASTEXITCODE -eq 0 -and $DockerOutput) {
        $DockerDigest = ($DockerOutput -replace 'sha256:', '')
        Write-Host "✅ Docker image digest: $DockerDigest" -ForegroundColor Green
        if (!(Test-Path 'expected')) { New-Item -ItemType Directory -Path 'expected' | Out-Null }
        $DockerDigest | Out-File -FilePath 'expected/image.digest' -Encoding UTF8
    }
    else {
        Write-Host "⚠️  Docker build failed, continuing..." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠️  Docker unavailable, skipping build" -ForegroundColor Yellow
}

# Step 2: Downloads
Write-Host "📥 Fetching summary + signature from IPFS..." -ForegroundColor Blue
$IpfsGateway = if ($env:IPFS_GATEWAY) { $env:IPFS_GATEWAY } else { 'https://ipfs.io/ipfs' }
$SummaryUrlGateway = "$IpfsGateway/$SummaryCid"
$SignatureUrlGateway = "$IpfsGateway/$SignatureCid"
$SummaryUrlLocal = "http://localhost:8080/ipfs/$SummaryCid"
$SignatureUrlLocal = "http://localhost:8080/ipfs/$SignatureCid"

$TempDir = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid())
New-Item -ItemType Directory -Path $TempDir | Out-Null
$SummaryFile = Join-Path $TempDir 'summary.json'
$SignatureFile = Join-Path $TempDir 'signature.json'

try {
    Get-WithFallback -Primary $SummaryUrlLocal -Fallback $SummaryUrlGateway -OutFile $SummaryFile -Label 'summary'
    Get-WithFallback -Primary $SignatureUrlLocal -Fallback $SignatureUrlGateway -OutFile $SignatureFile -Label 'signature'
}
catch {
    Write-Host "❌ Failed to download required files: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force
    exit 1
}

# Step 3: Signature verification
Write-Host "🔐 Verifying EIP-712 signature..." -ForegroundColor Blue
try {
    $VerifyResult = node scripts/verify-signature.js "$SummaryFile" "$SignatureFile" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host $VerifyResult -ForegroundColor Green
    }
    else {
        throw "Signature verification failed: $VerifyResult"
    }
}
catch {
    Write-Host "❌ $_" -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force; exit 1
}

# Step 3.5: ZK proof (optional)
Write-Host "🔬 Verifying ZK proof (if present)..." -ForegroundColor Blue
try {
    $SummaryContent = Get-Content $SummaryFile -Raw | ConvertFrom-Json
    if ($SummaryContent.zk -and $SummaryContent.zk.journalCid -and $SummaryContent.zk.proofCid) {
        $JournalCid = $SummaryContent.zk.journalCid
        $ProofCid = $SummaryContent.zk.proofCid
        $JournalUrl = "$IpfsGateway/$JournalCid"
        $ProofUrl = "$IpfsGateway/$ProofCid"
        $JournalFile = Join-Path $TempDir 'journal.json'
        $ProofFile = Join-Path $TempDir 'proof.bin'
        Invoke-WebRequest -Uri $JournalUrl -OutFile $JournalFile
        Invoke-WebRequest -Uri $ProofUrl -OutFile $ProofFile
        Write-Host "✅ Downloaded ZK artifacts" -ForegroundColor Green
        $ProgramId = (Get-Content $JournalFile -Raw | ConvertFrom-Json).programHash
        Write-Host "🔍 Program ID: $ProgramId" -ForegroundColor Yellow
        if (Get-Command risc0-verify -ErrorAction SilentlyContinue) {
            $ZkResult = risc0-verify --proof "$ProofFile" --image "$ProgramId" --journal "$JournalFile" 2>&1
            if ($LASTEXITCODE -eq 0) { Write-Host "✅ ZK proof verification passed" -ForegroundColor Green }
            else { Write-Host "❌ ZK proof verification failed: $ZkResult" -ForegroundColor Red }
        }
        else {
            Write-Host "⚠️  risc0-verify not installed; skipping" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "⚠️  No ZK proof data present" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠️  ZK proof step error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 4: Expected program hash
if ($ExpectedProgramHash) {
    Write-Host "🤖 Checking expected program hash..." -ForegroundColor Blue
    try {
        $ActualProgramHash = (Get-Content $SummaryFile -Raw | ConvertFrom-Json).programHash
        if ($ActualProgramHash -ne $ExpectedProgramHash) {
            Write-Host "❌ Program hash mismatch" -ForegroundColor Red
            Write-Host "   Expected: $ExpectedProgramHash" -ForegroundColor Gray
            Write-Host "   Actual:   $ActualProgramHash" -ForegroundColor Gray
            Remove-Item -Path $TempDir -Recurse -Force; exit 1
        }
        if (!(Test-Path 'expected')) { New-Item -ItemType Directory -Path 'expected' | Out-Null }
        $ExpectedProgramHash | Out-File -FilePath 'expected/program.sha256' -Encoding UTF8
        Write-Host "✅ Program hash matches" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Program hash verification error: $($_.Exception.Message)" -ForegroundColor Red
        Remove-Item -Path $TempDir -Recurse -Force; exit 1
    }
}
else {
    Write-Host "⚠️  No expected program hash provided (skipping)" -ForegroundColor Yellow
}

# Step 5: Summary info
Write-Host "📊 Summary Information" -ForegroundColor Cyan
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
    Write-Host "❌ Could not parse summary for display: $($_.Exception.Message)" -ForegroundColor Red
}

# Cleanup
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""; Write-Host "🎉 Verification completed" -ForegroundColor Green
Write-Host "📋 Reproducibility Info:" -ForegroundColor Cyan
Write-Host "   Docker Image Digest: $DockerDigest" -ForegroundColor Gray
Write-Host "   Summary CID:        $SummaryCid" -ForegroundColor Gray
Write-Host "   Signature CID:      $SignatureCid" -ForegroundColor Gray