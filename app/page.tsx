"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignTypedData, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import CidVerificationPanel from "./components/CidVerificationPanel";

interface UnsignedProvenanceResponse {
  provenance: any; // ContentProvenanceValue from backend
  domain: any;
  types: any;
  primaryType: string;
  providerOutput?: string;
  promptCid?: string;
  zk?: {
    mode: string;
    journalCid?: string;
    proofCid?: string;
    warnings?: string[];
  };
}

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState<"generate" | "verify">("generate");
  const [inputText, setInputText] = useState(
    "Write a concise summary about zero-knowledge proofs applications in content authenticity."
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [unsigned, setUnsigned] = useState<UnsignedProvenanceResponse | null>(
    null
  );
  const [publishedCid, setPublishedCid] = useState<string | null>(null);
  const [journalCid, setJournalCid] = useState<string | null>(null);
  const [proofCid, setProofCid] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  // ZK keywords always enabled now (toggle removed)
  const wantZk = true;
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [savedSummaryCid, setSavedSummaryCid] = useState<string | null>(null);
  const [savedSignatureCid, setSavedSignatureCid] = useState<string | null>(
    null
  );
  // Provider & model selection
  const [provider, setProvider] = useState<
    "mock" | "openai" | "anthropic" | "together"
  >("mock");
  const [model, setModel] = useState<string>("");

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function handleGenerate() {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    setError(null);
    setUnsigned(null);
    setPublishedCid(null);
    setJournalCid(null);
    setProofCid(null);
    setSignature(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          signer: address || "demo_user",
          provider,
          model: model || undefined,
          useZk: wantZk,
          params: { temperature: 0, top_p: 1 },
        }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const data: UnsignedProvenanceResponse = await res.json();
      setUnsigned(data);
      if (data.zk) {
        setJournalCid(data.zk.journalCid || null);
        setProofCid(data.zk.proofCid || null);
      }
    } catch (e) {
      console.error("Generation error", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  }

  async function uploadToIpfs(content: string, filename: string) {
    const form = new FormData();
    form.append(
      "file",
      new File([content], filename, { type: "application/json" })
    );
    const res = await fetch("/api/ipfs-upload", { method: "POST", body: form });
    if (!res.ok) throw new Error("IPFS upload failed");
    const json = await res.json();
    return json.cid as string;
  }

  const domain = {
    name: "AIProof",
    version: "1",
    chainId: chainId || 1,
    verifyingContract: "0x0000000000000000000000000000000000000000",
  } as const;
  const types = {
    SaveProof: [
      { name: "cid", type: "string" },
      { name: "modelHash", type: "string" },
      { name: "timestamp", type: "string" },
    ],
  } as const;

  async function handleSignAndPublish() {
    if (!unsigned) return;
    setSaveState("saving");
    try {
      let sig: string | null = null;
      if (isConnected && signTypedDataAsync) {
        sig = await signTypedDataAsync({
          domain: unsigned.domain,
          types: unsigned.types,
          primaryType: unsigned.primaryType,
          message: unsigned.provenance,
        });
        setSignature(sig);
      }
      const publishRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provenance: unsigned.provenance,
          signature: sig || "unsigned",
          signer: address || "demo_user",
          promptCid: unsigned.promptCid,
        }),
      });
      if (!publishRes.ok)
        throw new Error(`Publish failed (${publishRes.status})`);
      const pubJson = await publishRes.json();
      setPublishedCid(pubJson.signedProvenanceCid);
      if (pubJson.journalCid) setJournalCid(pubJson.journalCid);
      if (pubJson.proofCid) setProofCid(pubJson.proofCid);
      setSaveState("saved");
    } catch (e) {
      console.error("Publish error", e);
      setSaveState("error");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="border-b bg-white/70 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">
            AI Proof Demo
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600" suppressHydrationWarning>
              {mounted && isConnected
                ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
                : "demo.eth"}
            </div>
            <ConnectButton
              accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
              showBalance={false}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("generate")}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === "generate"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              ✨ Generate
            </button>
            <button
              onClick={() => setActiveTab("verify")}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === "verify"
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              🔍 Verify
            </button>
          </div>

          {activeTab === "generate" ? (
            <div>
              {/* Provider / Model Selection */}
              <div className="mb-4 flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="block font-semibold text-slate-700 mb-1 text-sm">
                    Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const p = e.target.value as typeof provider;
                      setProvider(p);
                      // Reset model placeholder when provider changes
                      if (p === "mock") setModel("");
                      if (p === "openai" && !model) setModel("gpt-4o-mini");
                      if (p === "anthropic" && !model)
                        setModel("claude-3-haiku-20240307");
                      if (p === "together" && !model)
                        setModel("meta-llama/Meta-Llama-3-8B-Instruct-Turbo");
                    }}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="mock">Mock (deterministic)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="together">Together</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block font-semibold text-slate-700 mb-1 text-sm">
                    Model (optional)
                  </label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={
                      provider === "mock"
                        ? "N/A"
                        : provider === "openai"
                        ? "gpt-4o-mini"
                        : provider === "anthropic"
                        ? "claude-3-haiku-20240307"
                        : "meta-llama/Meta-Llama-3-8B-Instruct-Turbo"
                    }
                    disabled={provider === "mock"}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>
              <label className="block font-semibold text-slate-700 mb-2">
                Input Text
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full h-32 p-4 border-2 border-slate-200 rounded-lg resize-none focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="Enter text to summarize..."
              />
              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !inputText.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isGenerating ? "⏳ Generating..." : "✨ Generate Summary"}
                </button>
              </div>
              {error && (
                <div className="mt-3 text-sm text-red-600">{error}</div>
              )}
              {unsigned && (
                <div className="mt-6 space-y-5">
                  {/* Generated Content */}
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-1">
                      Generated Content
                    </div>
                    <pre className="whitespace-pre-wrap text-sm bg-slate-50 p-4 rounded border border-slate-200 font-mono">
                      {unsigned.providerOutput}
                    </pre>
                  </div>

                  {/* Provenance Preview */}
                  <div className="grid gap-1 text-xs bg-slate-50 p-4 rounded border border-slate-200 font-mono">
                    <div className="font-semibold text-slate-700 mb-1">
                      Provenance (unsigned)
                    </div>
                    <div>Model ID: {unsigned.provenance.modelId}</div>
                    <div>Prompt Hash: {unsigned.provenance.promptHash}</div>
                    <div>Output Hash: {unsigned.provenance.outputHash}</div>
                    <div>Params Hash: {unsigned.provenance.paramsHash}</div>
                    <div>Content CID: {unsigned.provenance.contentCid}</div>
                    <div>
                      Attestation: {unsigned.provenance.attestationStrategy}
                    </div>
                    {unsigned.provenance.keywordsHash &&
                      unsigned.provenance.keywordsHash !==
                        "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                        <div>
                          Keywords Hash: {unsigned.provenance.keywordsHash}
                        </div>
                      )}
                    {unsigned.zk && (
                      <>
                        <div>ZK Mode: {unsigned.zk.mode}</div>
                        {journalCid && <div>Journal CID: {journalCid}</div>}
                        {proofCid && <div>Proof CID: {proofCid}</div>}
                        {unsigned.zk.warnings?.length ? (
                          <div>Warnings: {unsigned.zk.warnings.join(", ")}</div>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* Save & Sign */}
                  <div>
                    <button
                      onClick={handleSignAndPublish}
                      disabled={saveState === "saving"}
                      className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {saveState === "saving"
                        ? "⏳ Saving..."
                        : saveState === "saved"
                        ? "✅ Saved"
                        : "� Sign & Publish"}
                    </button>
                  </div>

                  {/* Stored Artifact CIDs */}
                  {(publishedCid || signature) && (
                    <div className="text-xs bg-emerald-50 border border-emerald-200 p-4 rounded space-y-1 font-mono">
                      <div className="font-semibold text-emerald-700 mb-1">
                        Stored Artifacts
                      </div>
                      {publishedCid && (
                        <div>Signed Provenance CID: {publishedCid}</div>
                      )}
                      {journalCid && <div>Journal CID: {journalCid}</div>}
                      {proofCid && <div>Proof CID: {proofCid}</div>}
                      {signature && (
                        <div>Signature: {signature.slice(0, 18)}…</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <CidVerificationPanel />
          )}
        </div>
      </main>
    </div>
  );
}
