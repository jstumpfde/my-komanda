import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "История обновлений | Company24",
  description:
    "Последние обновления и новые возможности платформы Company24.pro.",
}

type ChangelogEntry = {
  version: string
  date: string
  description: string
}

const ENTRIES: ChangelogEntry[] = [
  {
    version: "v0.4.0",
    date: "2026-04-18",
    description: "Модуль ОКК и оценка звонков",
  },
  {
    version: "v0.3.0",
    date: "2026-04-01",
    description: "CRM и воронка сделок",
  },
  {
    version: "v0.2.0",
    date: "2026-03-15",
    description: "HR-модуль и онбординг",
  },
  {
    version: "v0.1.0",
    date: "2026-03-01",
    description: "Первый релиз платформы",
  },
]

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-10">
          История обновлений
        </h1>
        <ul className="divide-y divide-white/10 text-left">
          {ENTRIES.map((entry) => (
            <li
              key={entry.version}
              className="py-5 flex flex-col sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="font-mono text-indigo-400 text-base md:text-lg shrink-0">
                {entry.version}
              </span>
              <span className="text-sm md:text-base text-gray-500 shrink-0 sm:w-28">
                {entry.date}
              </span>
              <span className="text-base md:text-lg text-gray-300 leading-relaxed">
                {entry.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
