"use client";
import { useState } from "react";

interface ProvenanceVerifyResponse {
  ok: boolean;
  issues: string[];
  warnings: string[];
  provenance: {
    modelId: string;
    attestationStrategy: string;
    programHash: string;
    keywordsHash: string | null;
    journalCid: string | null;
    proofCid: string | null;
    contentCid: string;
    outputHash: string;
    promptHash: string;
    paramsHash: string;
    timestamp: number;
  };
  signer?: string;
  recoveredSigner?: string;
  signature?: string;
  outputContent?: string;
  originalPrompt?: string;
  recomputed?: {
    outputHash?: string;
    promptHash?: string;
    keywordsHash?: string;
  };
}

export default function CidVerificationPanel() {
  const [cid, setCid] = useState("");
  const [includeContent, setIncludeContent] = useState(true);
  const [promptForCheck, setPromptForCheck] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProvenanceVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Basic loose CID pattern check for early feedback (CIDv0 Qm... or CIDv1 bafy...)
  function isLikelyCid(str: string) {
    if (!str) return false;
    const trimmed = str.trim();
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-HJ-NP-Za-km-z]{20,})$/.test(
      trimmed
    );
  }

  async function handleVerify() {
    if (!cid.trim()) {
      setError("Signed provenance CID required");
      return;
    }
    if (!isLikelyCid(cid)) {
      setError("CID format looks invalid");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const res = await fetch("/api/verify-provenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedProvenanceCid: cid.trim(),
          prompt: promptForCheck.trim() || undefined,
          includeContent,
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Verification failed");
      } else {
        setResult(json);
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        setError(
          "Request timed out: the CID may be invalid, not found on the gateway, or the network is slow. Please confirm the Signed Provenance CID and try again."
        );
      } else {
        setError(e.message || "Unexpected error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <h3 className="text-xl font-bold text-slate-800 mb-4">
        Signed Provenance Verification
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        Paste a signed provenance CID. Optionally supply the original prompt to
        check for tampering. You can also fetch and display the original
        generated content & prompt.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Signed Provenance CID *
          </label>
          <input
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            placeholder="Qm..."
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Original Prompt (optional for hash check)
          </label>
          <textarea
            value={promptForCheck}
            onChange={(e) => setPromptForCheck(e.target.value)}
            className="w-full min-h-[90px] p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="Paste original prompt to verify prompt hash"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
          <input
            type="checkbox"
            checked={includeContent}
            onChange={() => setIncludeContent((x) => !x)}
          />
          Show original content & prompt text
        </label>
        <div className="flex gap-3">
          <button
            onClick={handleVerify}
            disabled={loading || !cid.trim()}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "⏳ Verifying..." : "🔍 Verify"}
          </button>
          <button
            onClick={() => {
              setCid("");
              setPromptForCheck("");
              setResult(null);
              setError(null);
              setShowAdvanced(false);
            }}
            className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-red-500 hover:text-red-600"
          >
            🗑️ Clear
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && (
          <>
            {(() => {
              const issues = result.issues || [];
              const criticalSig = issues.some((i) =>
                [
                  "signature_invalid",
                  "signature_recover_mismatch",
                  "missing_signature",
                ].includes(i)
              );
              if (criticalSig) {
                return (
                  <div className="mt-4 p-4 rounded-lg border-2 border-red-300 bg-red-50 text-sm text-red-700">
                    <div className="font-semibold mb-1">Signature Problem</div>
                    <div>
                      The signature could not be validated. This provenance
                      record should NOT be trusted.
                    </div>
                    {result.recoveredSigner && (
                      <div className="mt-1 text-xs">
                        Recovered signer: {result.recoveredSigner}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
            <div className="mt-4 p-5 rounded-lg border border-slate-200 bg-slate-50">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🗂️</div>
                <div className="flex-1 text-sm text-slate-700 space-y-3">
                  <p className="font-semibold text-slate-800">
                    Provenance Information
                  </p>
                  <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">
                    <div>
                      <span className="font-medium">Model:</span>{" "}
                      {result.provenance.modelId}
                    </div>
                    <div>
                      <span className="font-medium">Attestation:</span>{" "}
                      {result.provenance.attestationStrategy}
                    </div>
                    <div>
                      <span className="font-medium">Signer:</span>{" "}
                      {result.signer || "(unknown)"}
                    </div>
                    {result.recoveredSigner &&
                      result.recoveredSigner.toLowerCase() !==
                        (result.signer || "").toLowerCase() && (
                        <div className="text-red-700 font-medium col-span-2">
                          Signer mismatch (recovered {result.recoveredSigner})
                        </div>
                      )}
                    {result.provenance.journalCid && (
                      <div>
                        <span className="font-medium">Journal CID:</span>{" "}
                        {result.provenance.journalCid}
                      </div>
                    )}
                    {result.provenance.proofCid && (
                      <div>
                        <span className="font-medium">Proof CID:</span>{" "}
                        {result.provenance.proofCid}
                      </div>
                    )}
                    <div className="col-span-2 text-xs text-slate-500">
                      (Hashes & signature hidden for simplicity)
                    </div>
                  </div>
                  {includeContent &&
                    (result.originalPrompt || result.outputContent) && (
                      <div className="grid md:grid-cols-2 gap-4 mt-2">
                        {result.originalPrompt && (
                          <div className="space-y-1 md:col-span-1">
                            <div className="text-xs font-semibold text-slate-600">
                              Original Prompt
                            </div>
                            <pre className="whitespace-pre-wrap bg-white border border-slate-200 p-3 rounded max-h-56 overflow-auto text-xs">
                              {result.originalPrompt}
                            </pre>
                          </div>
                        )}
                        {result.outputContent && (
                          <div className="space-y-1 md:col-span-1">
                            <div className="text-xs font-semibold text-slate-600">
                              Generated Output
                            </div>
                            <pre className="whitespace-pre-wrap bg-white border border-slate-200 p-3 rounded max-h-56 overflow-auto text-xs">
                              {result.outputContent}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  {result.issues.some((i) =>
                    [
                      "output_hash_mismatch",
                      "prompt_hash_mismatch",
                      "stored_prompt_hash_mismatch",
                      "keywords_hash_mismatch",
                    ].includes(i)
                  ) && (
                    <div className="text-xs text-amber-700 bg-white/70 border border-amber-300 rounded p-2">
                      Integrity notice: Some recomputed hashes differ from the
                      recorded values. (See Advanced diagnostics.)
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((x) => !x)}
                      className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100"
                    >
                      {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                    </button>
                  </div>
                  {showAdvanced && (
                    <div className="mt-3 space-y-3 text-xs">
                      <details
                        className="bg-white/70 rounded border border-slate-200 p-3"
                        open
                      >
                        <summary className="cursor-pointer font-semibold">
                          Field Explanations
                        </summary>
                        <ul className="list-disc ml-5 mt-2 space-y-1 text-xs">
                          <li>
                            <strong>Model</strong>: Identifier for the model
                            used.
                          </li>
                          <li>
                            <strong>Attestation</strong>: Whether a ZK keyword
                            extraction step (mock or real) was bound.
                          </li>
                          <li>
                            <strong>Signer</strong>: Address that signed the
                            provenance struct.
                          </li>
                          <li>
                            <strong>Journal CID</strong>: IPFS reference to
                            auxiliary data (e.g. keywords).
                          </li>
                          <li>
                            <strong>Proof CID</strong>: Placeholder
                            receipt/proof artifact (not yet verified).
                          </li>
                          <li>
                            <strong>Original Prompt / Generated Output</strong>:
                            Raw texts stored at publication.
                          </li>
                        </ul>
                        {(result.issues.length > 0 ||
                          result.warnings.length > 0) && (
                          <div className="mt-3 space-y-2">
                            {result.issues.length > 0 && (
                              <div className="text-red-700">
                                <span className="font-semibold">
                                  Issues Codes:
                                </span>{" "}
                                {result.issues.join(", ")}
                              </div>
                            )}
                            {result.warnings.length > 0 && (
                              <div className="text-amber-700">
                                <span className="font-semibold">Warnings:</span>{" "}
                                {result.warnings.join(", ")}
                              </div>
                            )}
                            {(result as any).signatureDebug?.error && (
                              <div className="text-xs text-slate-500">
                                Signature debug:{" "}
                                {(result as any).signatureDebug.error}
                              </div>
                            )}
                          </div>
                        )}
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
