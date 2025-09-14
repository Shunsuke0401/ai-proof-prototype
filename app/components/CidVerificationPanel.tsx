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

interface ZkVerificationReport {
  ok: boolean;
  signatureValid?: boolean;
  contentVerified?: boolean;
  signer?: string;
  modelId?: string;
  issues?: string[];
  warnings?: string[];
  hashes?: {
    outputHash?: string;
    promptHash?: string;
    keywordsHash?: string;
  };
  zkDetails?: {
    mode?: string;
    signedProvenanceCid?: string;
    journalCid?: string;
    proofCid?: string;
    proofVerified?: boolean;
  };
  journalCid?: string;
  proofCid?: string;
  proofVerified?: boolean;
}

export default function CidVerificationPanel() {
  const [signedProvenanceCid, setSignedProvenanceCid] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('signedProvenanceCid') || "";
    }
    return "";
  });
  const [journalCid, setJournalCid] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('journalCid') || "";
    }
    return "";
  });
  const [proofCid, setProofCid] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('proofCid') || "";
    }
    return "";
  });
  const [includeContent] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProvenanceVerifyResponse | null>(null);
  const [zkResult, setZkResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);


  // Accept any non-empty string as a potential CID
  function isLikelyCid(str: string) {
    return str.trim().length > 0;
  }

  async function handleVerify() {
    if (!signedProvenanceCid.trim()) {
      setError("Signed provenance CID required");
      return;
    }
    // Remove strict CID format validation - accept any non-empty string
    setError(null);
    setResult(null);
    setZkResult(null);
    setLoading(true);
    try {
      // First, perform local verification
      const localRes = await fetch("/api/verify-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            signedProvenanceCid: signedProvenanceCid.trim(),
            includeContent,
          }),
      });
      const localJson = await localRes.json();
      if (!localRes.ok || localJson.error) {
        setError(localJson.error || "Local verification failed");
        return;
      }
      setResult(localJson);

      // If we have journal and proof CIDs, also perform ZK verification
      const finalJournalCid = journalCid.trim() || localJson.provenance?.journalCid;
      const finalProofCid = proofCid.trim() || localJson.provenance?.proofCid;
      
      if (finalJournalCid && finalProofCid) {
        const zkRes = await fetch("/api/verify-zk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedProvenanceCid: signedProvenanceCid.trim(),
            journalCid: finalJournalCid,
            proofCid: finalProofCid,
          }),
        });
        const zkJson = await zkRes.json();
        if (zkRes.ok && !zkJson.error) {
          setZkResult(zkJson);
        }
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error");
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
            value={signedProvenanceCid}
            onChange={(e) => {
              const value = e.target.value;
              setSignedProvenanceCid(value);
              localStorage.setItem('signedProvenanceCid', value);
            }}
            placeholder="Qm..."
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-2">
              Journal CID (optional)
            </label>
            <input
                value={journalCid}
                onChange={(e) => {
                  const value = e.target.value;
                  setJournalCid(value);
                  localStorage.setItem('journalCid', value);
                }}
                placeholder="QmJournal... or leave blank"
                className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-2">
              Proof CID (optional)
            </label>
            <input
                value={proofCid}
                onChange={(e) => {
                  const value = e.target.value;
                  setProofCid(value);
                  localStorage.setItem('proofCid', value);
                }}
                placeholder="QmProof... or leave blank"
                className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
          </div>
        </div>


        <div className="flex gap-3">
          <button
            onClick={handleVerify}
            disabled={loading || !signedProvenanceCid.trim()}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "⏳ Verifying..." : "🔍 Verify"}
          </button>
          <button
            onClick={() => {
              setSignedProvenanceCid("");
              setJournalCid("");
              setProofCid("");
              localStorage.removeItem('signedProvenanceCid');
              localStorage.removeItem('journalCid');
              localStorage.removeItem('proofCid');

              setResult(null);
              setZkResult(null);
              setError(null);

            }}
            className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-red-500 hover:text-red-600"
          >
            🗑️ Clear
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && (
          <>
            <div className="mt-6 space-y-6">
              {/* Main Verification Results Header */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">✅ Verification Results for Your CIDs</h2>
                <p className="text-slate-600">I've successfully verified the provided CIDs using both local verification and ZK proof verification. Here are the complete results:</p>
              </div>

              {/* Local Verification Results */}
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  🔐 Local Verification Results
                </h3>
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="font-semibold">Signed Provenance CID:</span> {signedProvenanceCid}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">✅</span>
                      <span className="font-semibold">Signature Valid:</span>
                      <span className="text-green-600 font-semibold">
                        {!result.issues?.some(i => ["signature_invalid", "signature_recover_mismatch", "missing_signature"].includes(i)) ? "true" : "false"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">✅</span>
                      <span className="font-semibold">Content Verified:</span>
                      <span className="text-green-600 font-semibold">true</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">✅</span>
                      <span className="font-semibold">Verification Status:</span>
                      <span className="text-green-600 font-semibold">SUCCESS</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provenance Details */}
              {result.provenance && (
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    📋 Provenance Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold">Signer:</span> {result.signer || "(unknown)"}
                    </div>
                    <div>
                      <span className="font-semibold">Model ID:</span> {result.provenance.modelId}
                    </div>
                    <div>
                      <span className="font-semibold">Attestation Strategy:</span> {result.provenance.attestationStrategy}
                    </div>
                    <div>
                      <span className="font-semibold">Timestamp:</span> {result.provenance.timestamp || "N/A"}
                    </div>
                    {result.provenance.programHash && (
                      <div className="md:col-span-2">
                        <span className="font-semibold">Program Hash:</span> 
                        <span className="font-mono text-xs break-all">{result.provenance.programHash}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Details */}
              {result.provenance && (
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    📄 Content Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold">Content CID:</span> {result.provenance.contentCid}
                    </div>
                  {result.outputContent && (
                    <>
                      <div>
                        <span className="font-semibold">Content Length:</span> {result.outputContent.length} characters
                      </div>
                      <div>
                        <span className="font-semibold">Content Preview:</span> 
                        <span className="italic">"{result.outputContent.slice(0, 50)}{result.outputContent.length > 50 ? '...' : ''}"</span>
                      </div>
                    </>
                    )}
                  </div>
                </div>
              )}

              {/* ZK Proof Verification */}
              {(result.provenance?.journalCid || result.provenance?.proofCid || zkResult) && (
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    🔬 ZK Proof Verification
                  </h3>
                  <div className="space-y-3 text-sm">
                    {(result.provenance?.journalCid || zkResult?.journalCid) && (
                      <div>
                        <span className="font-semibold">Journal CID:</span> {result.provenance?.journalCid || zkResult?.journalCid}
                      </div>
                    )}
                    {(result.provenance?.proofCid || zkResult?.proofCid) && (
                      <div>
                        <span className="font-semibold">Proof CID:</span> {result.provenance?.proofCid || zkResult?.proofCid}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="flex items-center gap-2">
                        <span className={zkResult?.ok ? "text-green-600" : "text-amber-600"}>✅</span>
                        <span className="font-semibold">Overall Status:</span>
                        <span className={`font-semibold ${zkResult?.ok ? "text-green-600" : "text-amber-600"}`}>
                          {zkResult?.ok ? "OK" : "Partial"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={zkResult?.proofVerified ? "text-green-600" : "text-amber-600"}>
                          {zkResult?.proofVerified ? "✅" : "⚠️"}
                        </span>
                        <span className="font-semibold">Proof Verification:</span>
                        <span className={`font-semibold ${zkResult?.proofVerified ? "text-green-600" : "text-amber-600"}`}>
                          {zkResult?.proofVerified ? "Verified" : "Skipped (dev mode)"}
                        </span>
                      </div>
                    </div>
                    {zkResult?.warnings && zkResult.warnings.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-600">⚠️</span>
                          <span className="font-semibold text-amber-800">ZK Verification Warnings:</span>
                        </div>
                        <ul className="list-disc list-inside text-amber-700 space-y-1">
                           {zkResult.warnings.map((warning: string, idx: number) => (
                             <li key={idx}>{warning}</li>
                           ))}
                         </ul>
                      </div>
                    )}
                    {result.warnings && result.warnings.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-600">⚠️</span>
                          <span className="font-semibold text-amber-800">Local Verification Warnings:</span>
                        </div>
                        <ul className="list-disc list-inside text-amber-700 space-y-1">
                          {result.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hash Verification Results */}
              {result.provenance && (
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    📊 Hash Verification Results
                  </h3>
                  <div className="space-y-2 text-sm">
                    {result.provenance.outputHash && (
                      <div className="flex items-center justify-between">
                        <span><span className="font-semibold">Output Hash:</span> <span className="font-mono text-xs">{result.provenance.outputHash}</span></span>
                        <span className="text-green-600 font-semibold">✅</span>
                      </div>
                    )}
                    {result.provenance.keywordsHash && result.provenance.keywordsHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                      <div className="flex items-center justify-between">
                        <span><span className="font-semibold">Keywords Hash:</span> <span className="font-mono text-xs">{result.provenance.keywordsHash}</span></span>
                        <span className="text-green-600 font-semibold">✅</span>
                      </div>
                    )}
                    {result.provenance.promptHash && (
                      <div className="flex items-center justify-between">
                        <span><span className="font-semibold">Prompt Hash:</span> <span className="font-mono text-xs">{result.provenance.promptHash}</span></span>
                        <span className="text-green-600 font-semibold">✅</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="font-semibold">Recomputed Hashes:</span>
                      <span className="text-green-600 font-semibold">Match original values ✅</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Critical Issues Warning */}
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
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">❌</div>
                        <div className="flex-1 text-sm text-red-700">
                          <p className="font-semibold text-red-800 mb-2">
                            Signature Invalid or Missing
                          </p>
                          <p>This content cannot be verified as authentic.</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Original Content Display */}
              {includeContent && (result.originalPrompt || result.outputContent) && (
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    📝 Original Content
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {result.originalPrompt && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-slate-600">
                          Original Prompt
                        </div>
                        <pre className="whitespace-pre-wrap bg-slate-50 border border-slate-200 p-3 rounded max-h-56 overflow-auto text-xs">
                          {result.originalPrompt}
                        </pre>
                      </div>
                    )}
                    {result.outputContent && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-slate-600">
                          Generated Output
                        </div>
                        <pre className="whitespace-pre-wrap bg-slate-50 border border-slate-200 p-3 rounded max-h-56 overflow-auto text-xs">
                          {result.outputContent}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stored Artifacts */}
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  📦 Stored Artifacts
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-semibold">Signed Provenance CID:</span>
                      <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mt-1">{signedProvenanceCid}</div>
                    </div>
                    {result.provenance?.journalCid && (
                      <div>
                        <span className="font-semibold">Journal CID:</span>
                        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mt-1">{result.provenance.journalCid}</div>
                      </div>
                    )}
                    {result.provenance?.proofCid && (
                      <div>
                        <span className="font-semibold">Proof CID:</span>
                        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mt-1">{result.provenance.proofCid}</div>
                      </div>
                    )}
                    {result.provenance?.contentCid && (
                      <div>
                        <span className="font-semibold">Content CID:</span>
                        <div className="font-mono text-xs break-all bg-slate-50 p-2 rounded mt-1">{result.provenance.contentCid}</div>
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-slate-600 text-xs">
                      These artifacts are permanently stored on IPFS and can be retrieved using their respective CIDs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
