import { useState } from "react";

interface VerificationPanelProps {
  onVerify?: (signedProvenanceCid: string) => void;
}

interface ProvenanceVerificationResponse {
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
  signature?: string;
  signatureDomain?: string;
  recoveredSigner?: string;
}

interface ZkVerificationReport {
  ok: boolean;
  issues: string[];
  warnings: string[];
  hashes: Record<string, string | undefined>;
  zk?: {
    mode?: string;
    journalCid?: string;
    proofCid?: string;
    proofVerified?: boolean;
  };
}

export default function VerificationPanel({
  onVerify,
}: VerificationPanelProps) {
  // New fields
  const [signedProvenanceCid, setSignedProvenanceCid] = useState("");
  const [journalCid, setJournalCid] = useState("");
  const [proofCid, setProofCid] = useState("");
  const [promptText, setPromptText] = useState("");
  // Default to false so non-zk provenance doesn't look like a failure.
  const [expectKeywords, setExpectKeywords] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [provResult, setProvResult] =
    useState<ProvenanceVerificationResponse | null>(null);
  const [zkResult, setZkResult] = useState<ZkVerificationReport | null>(null);
  const [phase, setPhase] = useState<"idle" | "verifying" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setSignedProvenanceCid("");
    setJournalCid("");
    setProofCid("");
    setPromptText("");
    setExpectKeywords(true);
    setProvResult(null);
    setZkResult(null);
    setPhase("idle");
    setErrorMsg(null);
  };

  async function runVerification() {
    if (!signedProvenanceCid.trim()) {
      setErrorMsg("Signed Provenance CID is required");
      return;
    }
    setErrorMsg(null);
    setIsVerifying(true);
    setPhase("verifying");
    setProvResult(null);
    setZkResult(null);

    try {
      // Step 1: provenance level
      const provRes = await fetch("/api/verify-provenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedProvenanceCid: signedProvenanceCid.trim(),
          prompt: promptText.trim() || undefined,
          journalCid: journalCid.trim() || undefined,
          proofCid: proofCid.trim() || undefined,
          expectKeywords,
        }),
      });
      const provJson:
        | ProvenanceVerificationResponse
        | { error: string; issues?: string[] } = await provRes.json();
      if (!provRes.ok || (provJson as any).error) {
        setPhase("error");
        setErrorMsg(
          (provJson as any).error || "Provenance verification failed"
        );
        setProvResult(null);
        setIsVerifying(false);
        return;
      }
      setProvResult(provJson as ProvenanceVerificationResponse);
      onVerify && onVerify(signedProvenanceCid.trim());

      // Step 2: deeper hash + zk structural verification
      // Continue with zk phase (still verifying)
      const zkBody: any = { signedProvenanceCid: signedProvenanceCid.trim() };
      if (promptText.trim()) zkBody.prompt = promptText.trim();
      const zkRes = await fetch("/api/verify-zk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zkBody),
      });
      const zkJson: ZkVerificationReport | { error: string } =
        await zkRes.json();
      if (zkRes.ok && !(zkJson as any).error) {
        setZkResult(zkJson as ZkVerificationReport);
        setPhase("done");
      } else {
        setPhase("error");
        setErrorMsg((zkJson as any).error || "ZK verification failed");
      }
    } catch (e: any) {
      setPhase("error");
      setErrorMsg(e?.message || "Unexpected error");
    } finally {
      setIsVerifying(false);
    }
  }

  function badge(text: string, intent: "success" | "error" | "info" | "warn") {
    const map: Record<string, string> = {
      success: "bg-green-100 text-green-800 border-green-200",
      error: "bg-red-100 text-red-800 border-red-200",
      info: "bg-slate-100 text-slate-700 border-slate-200",
      warn: "bg-amber-100 text-amber-800 border-amber-200",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded text-xs font-semibold border ${map[intent]}`}
      >
        {text}
      </span>
    );
  }

  // Aggregate final status
  const aggregated = (() => {
    if (!provResult) return null;
    const issues = new Set<string>();
    const warnings = new Set<string>();
    provResult.issues.forEach((i) => issues.add(i));
    provResult.warnings.forEach((w) => warnings.add(w));
    if (zkResult) {
      zkResult.issues.forEach((i) => issues.add(i));
      zkResult.warnings.forEach((w) => warnings.add(w));
    }
    // Remove benign warning if user intentionally omitted prompt
    if (warnings.has("no_prompt_supplied"))
      warnings.delete("no_prompt_supplied");
    const ok =
      issues.size === 0 && (zkResult ? zkResult.ok : true) && provResult.ok;
    return {
      ok,
      issues: Array.from(issues),
      warnings: Array.from(warnings),
    };
  })();

  function renderAggregatedCard() {
    if (!aggregated) return null;
    const ok = aggregated.ok;
    return (
      <div
        className={`mt-6 p-5 rounded-lg border-2 ${
          ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl">{ok ? "✅" : "❌"}</div>
          <div className="flex-1">
            <p
              className={`font-semibold mb-2 ${
                ok ? "text-green-800" : "text-red-800"
              }`}
            >
              {ok
                ? "Provenance Verified"
                : "Verification Failed / Tampering Detected"}
            </p>
            {provResult && (
              <div className="text-sm text-slate-700 grid md:grid-cols-2 gap-y-1 gap-x-4">
                <div>
                  <span className="font-medium">Model:</span>{" "}
                  {provResult.provenance.modelId}
                </div>
                <div>
                  <span className="font-medium">Attestation:</span>{" "}
                  {provResult.provenance.attestationStrategy}
                </div>
                <div>
                  <span className="font-medium">Program Hash:</span>{" "}
                  {provResult.provenance.programHash ===
                  "0x0000000000000000000000000000000000000000000000000000000000000000"
                    ? "(none)"
                    : provResult.provenance.programHash}
                </div>
                <div className="col-span-2">
                  <span className="font-medium">Output Hash (Signed):</span>{" "}
                  {provResult.provenance.outputHash}
                </div>
                {zkResult?.hashes?.recomputedOutputHash &&
                  zkResult.hashes.recomputedOutputHash !==
                    provResult.provenance.outputHash && (
                    <div className="col-span-2 text-red-700 font-medium">
                      Recomputed Output Hash (Mismatch):{" "}
                      {zkResult.hashes.recomputedOutputHash}
                    </div>
                  )}
                <div>
                  <span className="font-medium">Prompt Hash:</span>{" "}
                  {provResult.provenance.promptHash}
                </div>
                <div>
                  <span className="font-medium">Params Hash:</span>{" "}
                  {provResult.provenance.paramsHash}
                </div>
                {provResult.signature && (
                  <div className="col-span-2">
                    <span className="font-medium">Signature:</span>{" "}
                    {provResult.signature.slice(0, 66)}…
                  </div>
                )}
                {provResult.signer && (
                  <div>
                    <span className="font-medium">Claimed Signer:</span>{" "}
                    {provResult.signer}
                  </div>
                )}
                {provResult.recoveredSigner && (
                  <div>
                    <span className="font-medium">Recovered Signer:</span>{" "}
                    {provResult.recoveredSigner}
                  </div>
                )}
                {provResult.recoveredSigner &&
                  provResult.signer &&
                  provResult.recoveredSigner.toLowerCase() !==
                    provResult.signer.toLowerCase() && (
                    <div className="col-span-2 text-red-700 font-semibold">
                      Signer Mismatch Detected
                    </div>
                  )}
                {zkResult?.zk?.mode && (
                  <div>
                    <span className="font-medium">ZK Mode:</span>{" "}
                    {zkResult.zk.mode}
                  </div>
                )}
              </div>
            )}
            {/* Explanatory accordion */}
            <details className="mt-4 bg-white/70 rounded border border-slate-200 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold">
                What was verified?
              </summary>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>
                  Signature binds model, prompt hash, params hash, content CID,
                  and (if present) ZK artifact CIDs.
                </li>
                <li>
                  We fetched the content CID and recomputed the output hash to
                  detect tampering.
                </li>
                <li>
                  If you entered the original prompt, its hash was recomputed
                  and compared.
                </li>
                <li>
                  If ZK keywords were provided, their hash was recomputed from
                  the journal.
                </li>
                <li>
                  Any mismatch appears above as an Issue (red) and flips status
                  to Tampered.
                </li>
                <li>
                  Warnings show reduced assurance (e.g. mock ZK, missing prompt,
                  unverified proof).
                </li>
              </ul>
              <p className="mt-3 font-medium">Academic Reviewer Tip:</p>
              <p>
                If status is green, the section can be cited as AI‑assisted with
                integrity preserved. Red means the text no longer matches what
                was originally signed.
              </p>
            </details>
            {aggregated.issues.length > 0 && (
              <div className="mt-4 border border-red-300 bg-white/70 rounded p-3">
                <div className="font-semibold text-red-700 mb-1">Issues:</div>
                <ul className="list-disc ml-5 text-red-700 text-sm">
                  {aggregated.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            {aggregated.warnings.length > 0 && (
              <div className="mt-4 border border-amber-300 bg-white/70 rounded p-3">
                <div className="font-semibold text-amber-700 mb-1">
                  Warnings:
                </div>
                <ul className="list-disc ml-5 text-amber-700 text-sm">
                  {aggregated.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-slate-800">
          Content Provenance Verification
        </h3>
        <div className="flex gap-2 items-center">
          {phase === "verifying" && badge("Verifying", "info")}
          {phase === "done" && aggregated?.ok && badge("Verified", "success")}
          {phase === "done" &&
            aggregated &&
            !aggregated.ok &&
            badge("Tampered", "error")}
          {phase === "idle" && badge("Idle", "info")}
        </div>
      </div>

      <p className="text-slate-600 mb-6">
        Enter the Signed Provenance CID. Optional fields let you simulate
        overrides for a tampering demo. A single combined result (green =
        verified, red = failed) will be shown below.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Signed Provenance CID *
          </label>
          <input
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            value={signedProvenanceCid}
            onChange={(e) => setSignedProvenanceCid(e.target.value)}
            placeholder="Qm..."
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-2">
              Journal CID (optional / override)
            </label>
            <input
              className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              value={journalCid}
              onChange={(e) => setJournalCid(e.target.value)}
              placeholder="QmJournal... or leave blank"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-2">
              Proof CID (optional / override)
            </label>
            <input
              className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              value={proofCid}
              onChange={(e) => setProofCid(e.target.value)}
              placeholder="QmProof... or leave blank"
            />
          </div>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Original Prompt (optional for prompt hash)
          </label>
          <textarea
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none min-h-[100px]"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Paste original prompt to recompute promptHash"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="expectKeywords"
            type="checkbox"
            checked={expectKeywords}
            onChange={() => setExpectKeywords((x) => !x)}
            className="h-4 w-4"
          />
          <label htmlFor="expectKeywords" className="text-sm text-slate-700">
            Expect keywords (fail if keywordsHash missing)
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={runVerification}
            disabled={isVerifying || !signedProvenanceCid.trim()}
            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isVerifying ? "⏳ Verifying..." : "🔍 Verify"}
          </button>
          <button
            onClick={reset}
            className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-red-500 hover:text-red-600 transition-colors"
          >
            🗑️ Clear
          </button>
        </div>
        {errorMsg && (
          <div className="text-sm text-red-600 mt-2">{errorMsg}</div>
        )}

        {/* Results */}
        {aggregated && renderAggregatedCard()}
      </div>
    </div>
  );
}
