"use client";

import type { AppFormData } from "../AppWizard";

const CATEGORIES = [
  "Business",
  "Communication",
  "Developer Tools",
  "Education",
  "Entertainment",
  "Finance",
  "Health & Fitness",
  "Lifestyle",
  "Media & Video",
  "Productivity",
  "Social",
  "Travel",
  "Utilities",
  "Other",
];

interface Props {
  data: AppFormData;
  onChange: (updates: Partial<AppFormData>) => void;
}

export default function AppInfoStep({ data, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">App Info</h2>
        <p className="text-sm text-zinc-500">
          Basic information about your application.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          App Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="My Awesome App"
          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Subtitle
          <span className="text-zinc-500 font-normal ml-1">(30 characters max)</span>
        </label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Describe what your app does in a short, plain-language phrase focused on function and user value.
        </p>
        <input
          type="text"
          value={data.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value.slice(0, 30) })}
          maxLength={30}
          placeholder='e.g. "Find flights and hotels"'
          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p className="text-xs text-zinc-500 mt-1 text-right">
          {data.subtitle.length}/30
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Description <span className="text-red-400">*</span>
        </label>
        <p className="text-xs text-zinc-500 mb-1.5">
          Write a clear, engaging description that highlights what your app does and why people will love it.
        </p>
        <textarea
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
          placeholder="Describe your app..."
          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Category
        </label>
        <select
          value={data.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="">Select a category...</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Developer Name
          </label>
          <input
            type="text"
            value={data.developerName}
            onChange={(e) => onChange({ developerName: e.target.value })}
            placeholder="Acme Inc."
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Website URL
          </label>
          <input
            type="url"
            value={data.websiteUrl}
            onChange={(e) => onChange({ websiteUrl: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}
