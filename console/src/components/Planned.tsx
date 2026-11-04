import type { ReactNode } from "react";

/** これから作る画面の案内。何ができるようになるかを具体的に並べる */
export function Planned({ lead, items }: { lead: string; items: { title: string; body: ReactNode }[] }) {
  return (
    <div className="px-4 py-5">
      <p className="text-ink-2">{lead}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={item.title} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
            <span className="font-medium text-ink">{item.title}</span>
            <span className="text-ink-2">{item.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
