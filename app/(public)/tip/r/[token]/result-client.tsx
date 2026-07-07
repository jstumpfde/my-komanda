"use client"

// Публичная страница результата разбора «Типология» — доступна по shareToken
// без логина. Контракт: GET /api/public/tip/shared/[token] ->
//   { resultMd, formula, context, name?, createdAt, highlights? }
// formula форма (lib/tip/calculation.ts, TipFormula):
//   { day, month, year, fullDate — каждая {value, sourceDigits, intermediate},
//     formulaString, digitCounts, missingDigits, repeatedDigits }
// highlights (опционально, tip_runs.highlights_json — заполняется отдельным
// AI-вызовом lib/tip/highlights.ts, встраивается координатором в
// runGeneration): { quotes: string[], strengths: string[] }.

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { renderTipMarkdownWithToc } from "@/components/tip/markdown"
import { getTipContext } from "@/lib/tip/contexts"
import { FormulaCard } from "@/components/tip/formula-card"
import { EnergyChart } from "@/components/tip/energy-chart"
import { TableOfContents } from "@/components/tip/table-of-contents"
import { ShareButtons } from "@/components/tip/share-buttons"
import { OwnerStatsBanner } from "@/components/tip/owner-stats-banner"
import { useViewHeartbeat } from "@/components/tip/use-view-heartbeat"

interface FormulaPosition {
  value: number
  sourceDigits: number[]
  intermediate: number[]
}

interface TipFormula {
  day: FormulaPosition
  month: FormulaPosition
  year: FormulaPosition
  fullDate: FormulaPosition
  formulaString: string
  digitCounts: Record<string, number>
  missingDigits: number[]
  repeatedDigits: number[]
}

interface TipHighlights {
  quotes?: string[]
  strengths?: string[]
}

interface SharedResult {
  resultMd: string
  formula: TipFormula
  context: string
  name?: string
  birthDate?: string
  createdAt: string
  highlights?: TipHighlights
}

export default function TipResultClient() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token
  const [data, setData] = useState<SharedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useViewHeartbeat(token)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`/api/public/tip/shared/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || "Разбор не найден")
        }
        return r.json()
      })
      .then((d: SharedResult) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить разбор")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-amber-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-medium text-stone-700">{error || "Разбор не найден"}</p>
        <Button onClick={() => router.push("/tip")}>Перейти к разбору</Button>
      </div>
    )
  }

  const contextInfo = getTipContext(data.context)
  const quotes = data.highlights?.quotes ?? []
  const strengths = data.highlights?.strengths ?? []
  const { html, toc } = renderTipMarkdownWithToc(data.resultMd, quotes)

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-20 pt-8 sm:pt-12">
      <header className="mb-6 text-center">
        {contextInfo && (
          <p className="mb-1 text-sm font-medium text-amber-600">
            {contextInfo.emoji} {contextInfo.title}
          </p>
        )}
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">
          {data.name ? `Разбор для ${data.name}` : "Ваш разбор"}
        </h1>
      </header>

      {token && <OwnerStatsBanner shareToken={token} />}

      {/* ── Карта личности (формула гербом + редкость) ── */}
      <FormulaCard formula={data.formula} name={data.name} birthDate={data.birthDate} />

      {/* ── Инфографика энергий ── */}
      <EnergyChart
        digitCounts={data.formula.digitCounts}
        missingDigits={data.formula.missingDigits}
        repeatedDigits={data.formula.repeatedDigits}
      />

      {/* ── Сильные стороны (если посчитаны) ── */}
      {strengths.length > 0 && (
        <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
          <h3 className="mb-3 text-base font-semibold text-stone-900">Сильные стороны</h3>
          <ul className="space-y-2">
            {strengths.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                  {idx + 1}
                </span>
                <span className="text-sm leading-relaxed text-stone-800">{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Оглавление ── */}
      <TableOfContents entries={toc} />

      {/* ── Разбор ── */}
      {/* Разметка уже приходит со своими Tailwind-классами из renderTipMarkdownWithToc
          (не полагаемся на каскад .prose — там собственные явные стили). */}
      <article className="max-w-none" dangerouslySetInnerHTML={{ __html: html }} />

      {/* ── Шеринг ── */}
      {token && (
        <div className="mt-10">
          <ShareButtons token={token} hasStrengths={strengths.length > 0} />
        </div>
      )}

      {/* ── Петля возврата ── */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => router.push("/tip?from=r")}
          variant="outline"
          className="flex-1 gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Разобрать себя в другой роли
        </Button>
        <Button
          onClick={() => router.push("/tip?pair=1")}
          variant="outline"
          className="flex-1 gap-2"
        >
          <Users className="h-4 w-4" /> Сравнить с другим человеком
        </Button>
      </div>

      <p className="mx-auto mt-10 max-w-md text-center text-xs leading-relaxed text-stone-400">
        Это не диагностика и не точное предсказание. Это прикладная поведенческая типология,
        инструмент для размышления, развития и выбора стратегии поведения.
      </p>
    </div>
  )
}
