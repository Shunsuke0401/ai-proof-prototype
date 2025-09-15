import crypto from 'crypto';

// Configuration from environment variables
const PROVER_URL = process.env.PROVER_URL || 'http://localhost:4000';
const PROVER_TIMEOUT_MS = parseInt(process.env.PROVER_TIMEOUT_MS || '180000', 10);
const PROVER_RETRIES = parseInt(process.env.PROVER_RETRIES || '2', 10);

// Types for prover communication
interface ProverRequest {
  image_id: string;
  input: string;
  seed?: number;
  model_fingerprint: string;
}

interface ProverResponse {
  ok: boolean;
  output?: any;
  receipt?: string; // base64-encoded RISC Zero receipt bytes
  error?: string;
}

interface ProverResult {
  success: boolean;
  output?: any;
  receiptBytes?: Buffer;
  error?: string;
}

// Structured logging events
interface LogEvent {
  event: 'prover_request_start' | 'prover_request_success' | 'prover_request_error';
  req_id: string;
  image_id: string;
  timestamp: number;
  duration_ms?: number;
  error?: string;
  attempt?: number;
}

// Generate a unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// Log structured events
function logEvent(event: LogEvent): void {
  console.log(JSON.stringify({
    ...event,
    timestamp: event.timestamp || Date.now()
  }));
}

// Sleep utility for exponential backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate exponential backoff delay
function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, etc.
  return Math.min(1000 * Math.pow(2, attempt), 30000); // Cap at 30 seconds
}

// Validate prover response
function validateProverResponse(response: any): response is ProverResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof response.ok === 'boolean' &&
    (response.ok === false || (
      response.output !== undefined &&
      typeof response.receipt === 'string'
    ))
  );
}

// Main function to call hosted prover with retry logic
export async function callHostedProver(
  imageId: string,
  input: string,
  modelFingerprint: string,
  seed?: number
): Promise<ProverResult> {
  const reqId = generateRequestId();
  const startTime = Date.now();
  
  // Log request start
  logEvent({
    event: 'prover_request_start',
    req_id: reqId,
    image_id: imageId,
    timestamp: startTime
  });

  const request: ProverRequest = {
    image_id: imageId,
    input,
    seed,
    model_fingerprint: modelFingerprint
  };

  let lastError: string = 'Unknown error';
  
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= PROVER_RETRIES; attempt++) {
    try {
      // Add backoff delay for retries (not on first attempt)
      if (attempt > 0) {
        const delay = getBackoffDelay(attempt - 1);
        console.log(`[prover] Retrying in ${delay}ms (attempt ${attempt + 1}/${PROVER_RETRIES + 1})`);
        await sleep(delay);
      }

      // Make HTTP request to hosted prover
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROVER_TIMEOUT_MS);
      
      const response = await fetch(`${PROVER_URL}/prove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ai-proof-prototype/1.0'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // Validate response structure
      if (!validateProverResponse(responseData)) {
        throw new Error('Invalid response format from prover');
      }
      
      // Check if prover reported success
      if (!responseData.ok) {
        throw new Error(responseData.error || 'Prover reported failure');
      }
      
      // Validate required fields are present
      if (!responseData.output || !responseData.receipt) {
        throw new Error('Missing required fields in prover response');
      }
      
      // Decode base64 receipt to bytes
      let receiptBytes: Buffer;
      try {
        receiptBytes = Buffer.from(responseData.receipt, 'base64');
      } catch (e) {
        throw new Error('Failed to decode base64 receipt');
      }
      
      const duration = Date.now() - startTime;
      
      // Log success
      logEvent({
        event: 'prover_request_success',
        req_id: reqId,
        image_id: imageId,
        timestamp: Date.now(),
        duration_ms: duration,
        attempt: attempt + 1
      });
      
      return {
        success: true,
        output: responseData.output,
        receiptBytes
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      
      // Log error for this attempt
      console.error(`[prover] Attempt ${attempt + 1} failed:`, lastError);
      
      // If this is the last attempt, break out of loop
      if (attempt === PROVER_RETRIES) {
        break;
      }
    }
  }
  
  // All attempts failed - log final error
  const duration = Date.now() - startTime;
  logEvent({
    event: 'prover_request_error',
    req_id: reqId,
    image_id: imageId,
    timestamp: Date.now(),
    duration_ms: duration,
    error: lastError,
    attempt: PROVER_RETRIES + 1
  });
  
  return {
    success: false,
    error: lastError
  };
}

// Utility function to compute SHA256 hash (for consistency with existing code)
export function sha256Hex(data: string | Buffer | Uint8Array): string {
  const buf: Buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  const bytes = Uint8Array.from(buf);
  return '0x' + crypto.createHash('sha256').update(bytes).digest('hex');
}

// Receipt verification utilities
interface ReceiptJournal {
  input_hash?: string;
  output_hash?: string;
  model_fingerprint?: string;
  programHash?: string;
  keywords?: any[];
  [key: string]: any;
}

interface ReceiptVerificationResult {
  success: boolean;
  journal?: ReceiptJournal;
  error?: string;
}

// Parse receipt journal from RISC Zero receipt bytes
// This is a simplified version - in production you'd use the RISC Zero SDK
export function parseReceiptJournal(receiptBytes: Buffer): ReceiptVerificationResult {
  try {
    // TODO: Implement proper RISC Zero receipt parsing
    // For now, this is a placeholder that assumes the journal is embedded as JSON
    // In a real implementation, you would use risc0-zkvm to parse the receipt
    
    // Attempt to find JSON data in the receipt bytes
    const receiptStr = receiptBytes.toString('utf8');
    
    // Look for JSON object that starts with { and contains input_hash
    const jsonStart = receiptStr.indexOf('{');
    if (jsonStart === -1) {
      return {
        success: false,
        error: 'No JSON object found in receipt bytes'
      };
    }
    
    // Find the end of the JSON object by counting braces
    let braceCount = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < receiptStr.length; i++) {
      if (receiptStr[i] === '{') braceCount++;
      if (receiptStr[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    const jsonStr = receiptStr.substring(jsonStart, jsonEnd);
    
    // Check if it contains input_hash field
    if (!jsonStr.includes('"input_hash"')) {
      return {
        success: false,
        error: 'JSON object does not contain required input_hash field'
      };
    }
    
    const journal = JSON.parse(jsonStr) as ReceiptJournal;
    return { success: true, journal };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse receipt journal: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Verify receipt against expected image_id (program hash)
// This is a simplified version - in production you'd use risc0-verify
export function verifyReceipt(receiptBytes: Buffer, expectedImageId: string): ReceiptVerificationResult {
  try {
    // TODO: Implement proper RISC Zero receipt verification
    // For now, this is a placeholder that parses the journal and checks basic structure
    
    const journalResult = parseReceiptJournal(receiptBytes);
    if (!journalResult.success || !journalResult.journal) {
      return journalResult;
    }
    
    const journal = journalResult.journal;
    
    // Check if the journal contains the expected program hash
    // Handle both raw imageId and hashed version for compatibility
    if (journal.programHash) {
      const expectedHash = sha256Hex(expectedImageId);
      if (journal.programHash !== expectedImageId && journal.programHash !== expectedHash) {
        return {
          success: false,
          error: `Program hash mismatch: expected ${expectedImageId} or ${expectedHash}, got ${journal.programHash}`
        };
      }
    }
    
    // Basic validation that required fields are present
    if (!journal.input_hash || !journal.output_hash) {
      return {
        success: false,
        error: 'Missing required hash fields in journal'
      };
    }
    
    return {
      success: true,
      journal
    };
  } catch (error) {
    return {
      success: false,
      error: `Receipt verification failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Validate journal bindings against computed hashes
export function validateJournalBindings(
  journal: ReceiptJournal,
  expectedInputHash: string,
  expectedOutputHash: string,
  expectedModelFingerprint: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check input hash
  if (journal.input_hash !== expectedInputHash) {
    errors.push(`Input hash mismatch: journal=${journal.input_hash}, expected=${expectedInputHash}`);
  }
  
  // Check output hash
  if (journal.output_hash !== expectedOutputHash) {
    errors.push(`Output hash mismatch: journal=${journal.output_hash}, expected=${expectedOutputHash}`);
  }
  
  // Check model fingerprint
  if (journal.model_fingerprint !== expectedModelFingerprint) {
    errors.push(`Model fingerprint mismatch: journal=${journal.model_fingerprint}, expected=${expectedModelFingerprint}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// TODO: Switch back to local rzup if needed
// This marker indicates where to revert to local proving if the hosted approach needs to be disabled