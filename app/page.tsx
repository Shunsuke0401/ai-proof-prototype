"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignTypedData, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import ContentTypeSelector from "./components/ContentTypeSelector";
import OutputArea from "./components/OutputArea";
import ShareModal from "./components/ShareModal";
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
  const [selectedType, setSelectedType] = useState("blog");
  const [activeTab, setActiveTab] = useState<"generate" | "verify">("generate");
  const [inputText, setInputText] = useState(
    "Write a comprehensive guide about DeFi yield farming strategies for beginners, covering the basics, risks, and how to get started safely."
  );
  const [outputContent, setOutputContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [zkResult, setZkResult] = useState<ZKSummaryResponse | null>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { signTypedDataAsync } = useSignTypedData();
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [savedSummaryCid, setSavedSummaryCid] = useState<string | null>(null);
  const [savedSignatureCid, setSavedSignatureCid] = useState<string | null>(
    null
  );

  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    setIsGenerating(true);
    setOutputContent("");

    try {
      const signer = address || "demo_user";

      // Call the summarize API
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          signer: signer,
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const result: ZKSummaryResponse = await response.json();
      setZkResult(result);

      // Create a formatted blog post based on the summary
      const formattedContent = `# ${selectedType}: ${result.summary.replace(
        "Key topics: ",
        ""
      )}

## Introduction

This content has been generated using advanced AI technology with cryptographic proof of authenticity. The key topics covered include: ${result.summary.replace(
        "Key topics: ",
        ""
      )}.

## Content Overview

${generateExpandedContent(result.summary)}

## Verification

This content was generated with:
- Program Hash: ${result.programHash}
- Input Hash: ${result.inputHash}
- Output Hash: ${result.outputHash}
- ZK Proof CID: ${result.zk.proofCid}
- Journal CID: ${result.zk.journalCid}

*This content is cryptographically verified and stored on IPFS for permanent provenance.*`;

      setOutputContent(formattedContent);
    } catch (error) {
      console.error("Generation error:", error);
      setOutputContent("Error generating content. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVerify = async (
    summaryCid: string,
    signatureCid: string,
    programHash?: string
  ) => {
    console.log("Verification completed for:", {
      summaryCid,
      signatureCid,
      programHash,
    });
    // Additional handling can be added here if needed
  };

  const getContentTypeTitle = (type: string) => {
    const titles: Record<string, string> = {
      blog: "Blog Post",
      email: "Email",
      report: "Report",
      code: "Code",
      creative: "Creative Writing",
    };
    return titles[type] || "Content";
  };

  const generateExpandedContent = (summary: string) => {
    const topics = summary.replace("Key topics: ", "").split(", ");
    return topics
      .map(
        (topic: string, index: number) =>
          `### ${index + 1}. ${topic.charAt(0).toUpperCase() + topic.slice(1)}

This section covers important aspects of ${topic} that are relevant to the overall discussion. The content here demonstrates the AI's understanding of the topic and provides valuable insights.`
      )
      .join("\n\n");
  };

  async function uploadToIpfs(
    content: Blob | string,
    filename: string,
    mime: string
  ) {
    const form = new FormData();
    const blob =
      typeof content === "string"
        ? new Blob([content], { type: mime })
        : content;
    form.append("file", new File([blob], filename, { type: mime }));
    const res = await fetch("/api/ipfs-upload", { method: "POST", body: form });
    if (!res.ok) throw new Error("IPFS upload failed");
    const data = await res.json();
    return data.cid as string;
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

  const handleSave = async () => {
    if (!zkResult) return;
    setSaveState("saving");
    try {
      // Build summary object (align with verifier expectations)
      const summaryObj = {
        programHash: zkResult.programHash,
        inputHash: zkResult.inputHash,
        outputHash: zkResult.outputHash,
        signer: address || "demo_user",
        timestamp: zkResult.timestamp,
        summary: zkResult.summary,
      };
      const summaryJson = JSON.stringify(summaryObj, null, 2);
      const summaryCid = await uploadToIpfs(
        summaryJson,
        "summary.json",
        "application/json"
      );

      // Typed data message
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
        } catch (e) {
          console.warn(
            "User rejected typed data signature, storing unsigned metadata"
          );
        }
      }

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
        "signature.json",
        "application/json"
      );

      setSavedSummaryCid(summaryCid);
      setSavedSignatureCid(signatureCid);
      setSaveState("saved");
    } catch (e) {
      console.error("Save error:", e);
      setSaveState("error");
    }
  };

  const provenanceData = zkResult
    ? {
        model: "Llama 3.1 8B",
        timestamp: new Date(zkResult.timestamp).toISOString(),
        programHash: zkResult.programHash,
        verified: true,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="header">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="logo-icon">🤖</div>
            <h1 className="text-xl font-bold text-slate-800">AI Studio</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block verified-badge">
              ✓ Verified Creator
            </div>
            <div
              className="text-slate-600 hidden md:block"
              suppressHydrationWarning
            >
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

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4">Content Types</h3>
            <ContentTypeSelector
              selectedType={selectedType}
              onTypeChange={setSelectedType}
            />

            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-3">Recent</h3>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  📝 <span>DeFi Guide (2 min ago)</span>
                </div>
                <div className="flex items-center gap-2">
                  📊 <span>Q3 Report (1 hour ago)</span>
                </div>
                <div className="flex items-center gap-2">
                  💻 <span>React Component (3 hours ago)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Workspace */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab("generate")}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${
                  activeTab === "generate"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                ✨ Generate Content
              </button>
              <button
                onClick={() => setActiveTab("verify")}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${
                  activeTab === "verify"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                🔍 Verify Content
              </button>
            </div>

            {activeTab === "generate" ? (
              <>
                {/* Workspace Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Create {getContentTypeTitle(selectedType)}
                  </h2>
                  <div className="bg-slate-100 px-4 py-2 rounded-lg text-sm text-slate-600 flex items-center gap-2">
                    🧠 Llama 3.1 8B • Local
                  </div>
                </div>

                {/* Input Area */}
                <div className="mb-6">
                  <label className="block font-semibold text-slate-700 mb-2">
                    What would you like to create?
                  </label>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full h-32 p-4 border-2 border-slate-200 rounded-lg resize-none focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Describe what you want to create..."
                  />
                </div>

                {/* Generate Section */}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !inputText.trim()}
                    className="generate-btn flex items-center gap-2"
                  >
                    {isGenerating ? "⏳ Generating..." : "✨ Generate Content"}
                  </button>
                </div>

                {zkResult && (
                  <div className="mb-4 space-y-2 text-sm text-slate-600 bg-slate-50 p-4 rounded border border-slate-200">
                    <div className="font-semibold text-slate-700">
                      Generation Metadata
                    </div>
                    <div>Program Hash: {zkResult.programHash}</div>
                    <div>Input Hash: {zkResult.inputHash}</div>
                    <div>Output Hash: {zkResult.outputHash}</div>
                  </div>
                )}

                {/* Output Area */}
                <OutputArea
                  content={outputContent}
                  isGenerating={isGenerating}
                  provenanceData={provenanceData}
                  onShare={() => setShowShareModal(true)}
                  onCopy={() => navigator.clipboard.writeText(outputContent)}
                  onExport={() => console.log("Export placeholder")}
                />

                {zkResult && (
                  <div className="mt-6">
                    <button
                      onClick={handleSave}
                      disabled={saveState === "saving"}
                      className="px-6 py-3 rounded-lg font-semibold bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 disabled:opacity-60"
                    >
                      {saveState === "saving"
                        ? "⏳ Saving..."
                        : saveState === "saved"
                        ? "✅ Saved"
                        : "💾 Save & Sign"}
                    </button>
                    {saveState === "error" && (
                      <div className="mt-2 text-sm text-red-600">
                        Save failed. Check console.
                      </div>
                    )}
                    {(savedSummaryCid || savedSignatureCid) && (
                      <div className="mt-4 text-sm bg-slate-50 border border-slate-200 rounded p-4 space-y-1">
                        <div className="font-semibold text-slate-700">
                          Stored CIDs
                        </div>
                        {savedSummaryCid && (
                          <div>
                            Summary CID:{" "}
                            <span className="font-mono break-all">
                              {savedSummaryCid}
                            </span>
                          </div>
                        )}
                        {savedSignatureCid && (
                          <div>
                            Signature CID:{" "}
                            <span className="font-mono break-all">
                              {savedSignatureCid}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Verification Panel */
              <VerificationPanel onVerify={handleVerify} />
            )}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          contentCids={
            zkResult
              ? {
                  encryptedCid: zkResult.zk.proofCid,
                  summaryCid: zkResult.zk.journalCid,
                  signatureCid: zkResult.programHash,
                }
              : undefined
          }
          provenanceData={provenanceData}
        />
      )}
    </div>
  );
}
