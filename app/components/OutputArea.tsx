"use client";

import { useState } from "react";

interface OutputAreaProps {
  content: string;
  isGenerating: boolean;
  provenanceData?: {
    model: string;
    timestamp: string;
    programHash: string;
    verified: boolean;
  };
  onShare: () => void;
  onCopy: () => void;
  onExport: () => void;
}

export default function OutputArea({
  content,
  isGenerating,
  provenanceData,
  onShare,
  onCopy,
  onExport,
}: OutputAreaProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-gray-200 pt-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">
            Generated Content
          </h3>
          {provenanceData?.verified && (
            <div className="provenance-badge">✓ Verified AI Content</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="action-btn"
            onClick={handleCopy}
            disabled={!content || isGenerating}
          >
            {copied ? "✅ Copied!" : "📋 Copy"}
          </button>
          <button
            className="action-btn"
            onClick={onExport}
            disabled={!content || isGenerating}
          >
            📥 Export
          </button>
          <button
            className="action-btn primary"
            onClick={onShare}
            disabled={!content || isGenerating}
          >
            🔗 Share
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 min-h-[200px] font-mono text-sm leading-relaxed text-gray-700">
          {isGenerating ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-500">Generating content...</span>
            </div>
          ) : content ? (
            <pre className="whitespace-pre-wrap">{content}</pre>
          ) : (
            <div className="text-gray-400 italic">
              Generated content will appear here...
            </div>
          )}
        </div>
      </div>

      {provenanceData && content && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 font-semibold text-green-700 mb-2">
            🛡️ Content Provenance
          </div>
          <div className="text-sm text-gray-700 leading-relaxed">
            This content was generated using{" "}
            <strong>{provenanceData.model}</strong> on your local machine on{" "}
            {new Date(provenanceData.timestamp).toLocaleDateString()} at{" "}
            {new Date(provenanceData.timestamp).toLocaleTimeString()}. The
            content has been cryptographically signed and is verifiable on the
            blockchain. No external APIs were used, ensuring complete privacy
            and ownership.
          </div>
        </div>
      )}
    </div>
  );
}
