import { useState } from "react";

interface VerificationInputProps {
  onVerify: (
    summaryCid: string,
    signatureCid: string,
    programHash?: string
  ) => void;
}

interface VerificationResult {
  status: "success" | "error" | "loading";
  message: string;
  details?: {
    programHash?: string;
    inputHash?: string;
    outputHash?: string;
    signer?: string;
    timestamp?: string;
    dockerDigest?: string;
  };
}

export default function VerificationPanel({
  onVerify,
}: VerificationInputProps) {
  const [summaryCid, setSummaryCid] = useState("");
  const [signatureCid, setSignatureCid] = useState("");
  const [programHash, setProgramHash] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);

  const handleVerify = async () => {
    if (!summaryCid.trim() || !signatureCid.trim()) {
      setVerificationResult({
        status: "error",
        message: "Please provide both Summary CID and Signature CID",
      });
      return;
    }

    setIsVerifying(true);
    setVerificationResult({
      status: "loading",
      message: "Verifying content...",
    });

    try {
      // Call the verification API endpoint
      const response = await fetch("/api/verify-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryCid: summaryCid.trim(),
          signatureCid: signatureCid.trim(),
          programHash: programHash.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setVerificationResult({
          status: "success",
          message: result.message || "Verification completed successfully!",
          details: result.details,
        });
        onVerify(summaryCid, signatureCid, programHash || undefined);
      } else {
        setVerificationResult({
          status: "error",
          message: result.error || "Verification failed",
        });
      }
    } catch (error) {
      setVerificationResult({
        status: "error",
        message: `Verification error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearInputs = () => {
    setSummaryCid("");
    setSignatureCid("");
    setProgramHash("");
    setVerificationResult(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "loading":
        return "⏳";
      default:
        return "🔍";
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-slate-800">
          Content Verification
        </h3>
        <div className="bg-slate-100 px-3 py-1 rounded-lg text-sm text-slate-600">
          🔐 Cryptographic Proof
        </div>
      </div>

      <p className="text-slate-600 mb-6">
        Verify AI-generated content using IPFS CIDs and cryptographic
        signatures. Enter the CIDs from a previously generated content to
        validate its authenticity.
      </p>

      <div className="space-y-4">
        {/* Summary CID Input */}
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Summary CID *
          </label>
          <input
            type="text"
            value={summaryCid}
            onChange={(e) => setSummaryCid(e.target.value)}
            placeholder="QmSummary123... (IPFS hash of the content metadata)"
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Signature CID Input */}
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Signature CID *
          </label>
          <input
            type="text"
            value={signatureCid}
            onChange={(e) => setSignatureCid(e.target.value)}
            placeholder="QmSignature456... (IPFS hash of the cryptographic signature)"
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Program Hash Input (Optional) */}
        <div>
          <label className="block font-semibold text-slate-700 mb-2">
            Expected Program Hash{" "}
            <span className="text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            value={programHash}
            onChange={(e) => setProgramHash(e.target.value)}
            placeholder="abc123... (Expected hash of the AI model/program)"
            className="w-full p-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleVerify}
            disabled={isVerifying || !summaryCid.trim() || !signatureCid.trim()}
            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isVerifying ? <>⏳ Verifying...</> : <>🔍 Verify Content</>}
          </button>

          <button
            onClick={handleClearInputs}
            className="px-5 py-3 border-2 border-slate-200 text-slate-600 rounded-lg hover:border-red-500 hover:text-red-600 transition-colors"
          >
            🗑️ Clear
          </button>
        </div>

        {/* Verification Result */}
        {verificationResult && (
          <div
            className={`mt-6 p-4 rounded-lg border-2 ${
              verificationResult.status === "success"
                ? "border-green-200 bg-green-50"
                : verificationResult.status === "error"
                ? "border-red-200 bg-red-50"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {getStatusIcon(verificationResult.status)}
              </span>
              <div className="flex-1">
                <p
                  className={`font-semibold ${
                    verificationResult.status === "success"
                      ? "text-green-800"
                      : verificationResult.status === "error"
                      ? "text-red-800"
                      : "text-blue-800"
                  }`}
                >
                  {verificationResult.message}
                </p>

                {verificationResult.details && (
                  <div className="mt-3 space-y-2 text-sm">
                    <h4 className="font-semibold text-slate-700">
                      Verification Details:
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-600">
                      {verificationResult.details.programHash && (
                        <div>
                          <span className="font-medium">Program Hash:</span>{" "}
                          {verificationResult.details.programHash}
                        </div>
                      )}
                      {verificationResult.details.inputHash && (
                        <div>
                          <span className="font-medium">Input Hash:</span>{" "}
                          {verificationResult.details.inputHash}
                        </div>
                      )}
                      {verificationResult.details.outputHash && (
                        <div>
                          <span className="font-medium">Output Hash:</span>{" "}
                          {verificationResult.details.outputHash}
                        </div>
                      )}
                      {verificationResult.details.signer && (
                        <div>
                          <span className="font-medium">Signer:</span>{" "}
                          {verificationResult.details.signer}
                        </div>
                      )}
                      {verificationResult.details.timestamp && (
                        <div>
                          <span className="font-medium">Timestamp:</span>{" "}
                          {verificationResult.details.timestamp}
                        </div>
                      )}
                      {/* dockerDigest not available in JS verification path currently */}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
