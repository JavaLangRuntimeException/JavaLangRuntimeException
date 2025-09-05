"use client";

import React from "react";

export function MeetingNoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:col-span-2">
      <h2 className="mb-3 text-sm font-semibold text-zinc-700">ご相談詳細(任意)</h2>
      <textarea
        className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 min-h-[120px]"
        placeholder="当日話したい内容や事前共有事項があればご記入ください"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-zinc-500">Googleカレンダーの予定の詳細に記載されます（任意）。</p>
    </div>
  );
}


