import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Статус системы | Company24",
}

const statuses = [
  "✅ API: операционный",
  "✅ База данных: операционный",
  "✅ AI-агенты: 24/7 активны",
]

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-center">
          Статус системы
        </h1>
        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          {statuses.map((status) => (
            <div
              key={status}
              className="text-sm py-3 px-4 border-b border-gray-800 last:border-b-0"
            >
              {status}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
