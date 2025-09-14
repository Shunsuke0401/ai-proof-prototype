"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignTypedData, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import VerificationPanel from "./components/VerificationPanel";

interface ZKSummaryResponse {
  summary: string;
  programHash: string;
  inputHash: string;
  outputHash: string;
  zk: {
    proofCid: string;
    journalCid: string;
  };
  signer: string;
  timestamp: number;
}

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState<"generate" | "verify">("generate");
  const [inputText, setInputText] = useState(
    "Write a concise summary about zero-knowledge proofs applications in content authenticity."
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [zkResult, setZkResult] = useState<ZKSummaryResponse | null>(null);
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
    "mock" | "ollama" | "openai" | "anthropic" | "together"
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
    setZkResult(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          signer: address || "demo_user",
          provider,
          model: model || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
      const data: ZKSummaryResponse = await res.json();
      setZkResult(data);
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

  async function handleSave() {
    if (!zkResult) return;
    setSaveState("saving");
    try {
      // 1. Store summary JSON
      const summaryObject = {
        summary: zkResult.summary,
        programHash: zkResult.programHash,
        inputHash: zkResult.inputHash,
        outputHash: zkResult.outputHash,
        proofCid: zkResult.zk.proofCid,
        journalCid: zkResult.zk.journalCid,
        signer: address || "demo_user",
        timestamp: zkResult.timestamp,
      };
      const summaryCid = await uploadToIpfs(
        JSON.stringify(summaryObject, null, 2),
        "summary.json"
      );

      // 2. Build typed data + sign (optional)
      const message = {
        cid: summaryCid,
        modelHash: zkResult.programHash,
        timestamp: new Date(zkResult.timestamp).toISOString(),
      } as const;
      let signature: string | null = null;
      if (isConnected && signTypedDataAsync) {
        try {
          signature = await signTypedDataAsync({
            domain,
            types,
            primaryType: "SaveProof",
            message,
          });
        } catch (sigErr) {
          console.warn("Signature skipped", sigErr);
        }
      }

      // 3. Store signature wrapper
      const signatureObj = {
        signer: address || "demo_user",
        domain,
        types,
        primaryType: "SaveProof",
        value: message,
        signature: signature || "unsigned",
      };
      const signatureCid = await uploadToIpfs(
        JSON.stringify(signatureObj, null, 2),
        "signature.json"
      );

      setSavedSummaryCid(summaryCid);
      setSavedSignatureCid(signatureCid);
      setSaveState("saved");
    } catch (e) {
      console.error("Save error", e);
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
                      if (p === "ollama" && !model) setModel("llama3");
                      if (p === "openai" && !model) setModel("gpt-4o-mini");
                      if (p === "anthropic" && !model)
                        setModel("claude-3-haiku-20240307");
                      if (p === "together" && !model)
                        setModel("meta-llama/Meta-Llama-3-8B-Instruct-Turbo");
                    }}
                    className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="mock">Mock (deterministic)</option>
                    <option value="ollama">Ollama (local)</option>
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
                        : provider === "ollama"
                        ? "llama3"
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
              <div className="mt-4">
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
              {zkResult && (
                <div className="mt-6 space-y-5">
                  {/* Summary Block */}
                  <div>
                    <div className="text-sm font-semibold text-slate-700 mb-1">
                      Summary
                    </div>
                    <pre className="whitespace-pre-wrap text-sm bg-slate-50 p-4 rounded border border-slate-200 font-mono">
                      {zkResult.summary}
                    </pre>
                  </div>

                  {/* Metadata / ZK (mock) Panel */}
                  <div className="grid gap-2 text-xs bg-slate-50 p-4 rounded border border-slate-200 font-mono">
                    <div className="font-semibold text-slate-700 mb-1 normal-case tracking-normal">
                      Generation Metadata (mock ZK)
                    </div>
                    <div>Program Hash: {zkResult.programHash}</div>
                    <div>Input Hash: {zkResult.inputHash}</div>
                    <div>Output Hash: {zkResult.outputHash}</div>
                    <div>Encrypted CID: {zkResult.zk.proofCid}</div>
                    <div>Journal CID: {zkResult.zk.journalCid}</div>
                  </div>

                  {/* Save & Sign */}
                  <div>
                    <button
                      onClick={handleSave}
                      disabled={saveState === "saving"}
                      className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {saveState === "saving"
                        ? "⏳ Saving..."
                        : saveState === "saved"
                        ? "✅ Saved"
                        : "💾 Save & Sign"}
                    </button>
                  </div>

                  {/* Stored Artifact CIDs */}
                  {(savedSummaryCid || savedSignatureCid) && (
                    <div className="text-xs bg-emerald-50 border border-emerald-200 p-4 rounded space-y-1 font-mono">
                      <div className="font-semibold text-emerald-700 mb-1">
                        Stored Artifacts
                      </div>
                      {savedSummaryCid && (
                        <div>Summary CID: {savedSummaryCid}</div>
                      )}
                      {savedSignatureCid && (
                        <div>Signature CID: {savedSignatureCid}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <VerificationPanel
              onVerify={() => {
                /* handled internally */
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
