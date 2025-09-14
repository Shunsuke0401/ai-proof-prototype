"use client";
import { useState } from "react";

interface SimpleResult {
  ok: boolean;
  status?: string;
  signer?: string;
  recoveredSigner?: string;
  signedProvenanceCid?: string;
  modelId?: string;
  attestation?: string;
  zkKeywordsIncluded?: boolean;
  timestamp?: number;
  details?: {
    promptMismatch?: boolean;
    signatureMissing?: boolean;
    signerMismatch?: boolean;
  };
  reason?: string;
  message?: string;
  error?: string;
}

export default function SimpleVerificationPanel() {
  const [content, setContent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimpleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    if (!content.trim()) {
      setError("Content required");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/verify-content-simple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, prompt: prompt.trim() || undefined }),
      });
      const json: SimpleResult = await res.json();
      setResult(json);
      if (!json.ok && !json.error && json.message) setError(json.message);
      if (json.error) setError(json.error);
    } catch (e: any) {
      setError(e.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function statusBadge() {
    if (!result) return null;
    const base = "px-2 py-0.5 rounded text-xs font-semibold border";
    if (result.ok)
      return (
        <span
          className={base + " bg-green-100 text-green-800 border-green-200"}
        >
          Verified
        </span>
      );
    return (
      <span className={base + " bg-red-100 text-red-800 border-red-200"}>
        Not Verified
      </span>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-slate-800 mb-4">
        Content Verification
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        Paste AI-generated content below. (Optional) also paste the original
        prompt. The system will automatically discover and validate its
        provenance without exposing low-level hashes.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Content *
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[160px] p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="Paste generated content here..."
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Original Prompt (optional)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-[90px] p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="Paste original prompt to strengthen verification"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleVerify}
            disabled={loading || !content.trim()}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "⏳ Verifying..." : "🔍 Verify"}
          </button>
          <button
            onClick={() => {
              setContent("");
              setPrompt("");
              setResult(null);
              setError(null);
            }}
            className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-red-500 hover:text-red-600"
          >
            🗑️ Clear
          </button>
          {statusBadge()}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && !result.error && (
          <div
            className={`mt-4 p-5 rounded-lg border-2 ${
              result.ok
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">{result.ok ? "✅" : "❌"}</div>
              <div className="flex-1 text-sm text-slate-700">
                <p
                  className={`font-semibold mb-2 ${
                    result.ok ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.ok ? "Authentic & Untampered" : "Not Verified"}
                </p>
                {result.signedProvenanceCid && (
                  <div>
                    <span className="font-medium">Provenance Record:</span>{" "}
                    {result.signedProvenanceCid}
                  </div>
                )}
                {result.signer && (
                  <div>
                    <span className="font-medium">Signer:</span> {result.signer}
                  </div>
                )}
                {result.recoveredSigner &&
                  result.recoveredSigner.toLowerCase() !==
                    (result.signer || "").toLowerCase() && (
                    <div className="text-red-700 font-medium">
                      Signer Mismatch
                    </div>
                  )}
                {result.modelId && (
                  <div>
                    <span className="font-medium">Model ID:</span>{" "}
                    {result.modelId}
                  </div>
                )}
                {result.attestation && (
                  <div>
                    <span className="font-medium">Attestation:</span>{" "}
                    {result.attestation}
                    {result.zkKeywordsIncluded ? " (keywords bound)" : ""}
                  </div>
                )}
                {result.details?.promptMismatch && (
                  <div className="text-red-700 font-medium">
                    Prompt Mismatch
                  </div>
                )}
                <details className="mt-3 bg-white/70 rounded border border-slate-200 p-3 text-slate-700">
                  <summary className="cursor-pointer font-semibold">
                    What this means
                  </summary>
                  <ul className="list-disc ml-5 mt-2 text-xs space-y-1">
                    <li>
                      We matched the content (by hash) to a previously
                      published, signed provenance record.
                    </li>
                    <li>
                      The signature binds the model, parameters, and the
                      original content at time of publication.
                    </li>
                    <li>
                      Your optional prompt helps confirm the prompt used
                      originally.
                    </li>
                    <li>
                      No raw hashes are shown here to keep UX simple; only
                      overall authenticity.
                    </li>
                  </ul>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
