"use client";

import { useState } from "react";

interface ContentType {
  id: string;
  icon: string;
  name: string;
}

const contentTypes: ContentType[] = [
  { id: "blog", icon: "📝", name: "Blog Post" },
  { id: "email", icon: "📧", name: "Email" },
  { id: "report", icon: "📊", name: "Report" },
  { id: "code", icon: "💻", name: "Code" },
  { id: "creative", icon: "🎨", name: "Creative" },
];

interface ContentTypeSelectorProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
}

export default function ContentTypeSelector({
  selectedType,
  onTypeChange,
}: ContentTypeSelectorProps) {
  return (
    <div className="bg-white rounded-lg p-6 h-fit shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-700">
        Content Types
      </h3>
      <div className="flex flex-col gap-2">
        {contentTypes.map((type) => (
          <div
            key={type.id}
            className={`content-type ${
              selectedType === type.id ? "active" : ""
            }`}
            onClick={() => onTypeChange(type.id)}
          >
            <div className="text-xl">{type.icon}</div>
            <div className="font-medium">{type.name}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Recent</h3>
        <div className="text-gray-500 text-sm space-y-2">
          <div className="cursor-pointer hover:text-gray-700">
            📝 DeFi Guide (2 min ago)
          </div>
          <div className="cursor-pointer hover:text-gray-700">
            📊 Q3 Report (1 hour ago)
          </div>
          <div className="cursor-pointer hover:text-gray-700">
            💻 React Component (3 hours ago)
          </div>
        </div>
      </div>
    </div>
  );
}
