"use client"

// Оглавление-якоря по заголовкам h2 разбора. Компактный горизонтальный
// список ссылок на секции (не боковая панель — отчёт читают на мобильном).

import type { TipTocEntry } from "@/components/tip/markdown"

export function TableOfContents({ entries }: { entries: TipTocEntry[] }) {
  if (entries.length < 2) return null

  return (
    <nav
      aria-label="Оглавление разбора"
      className="mb-8 rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:p-5"
    >
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
        Разделы разбора
      </p>
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {entries.map((entry, idx) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-sm text-stone-700 transition-colors hover:bg-amber-50 hover:text-amber-700"
            >
              <span className="text-xs font-semibold text-amber-500">{idx + 1}.</span>
              <span className="leading-snug">{entry.text}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
