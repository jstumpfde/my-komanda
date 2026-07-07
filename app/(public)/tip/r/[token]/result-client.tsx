"use client"

// Публичная страница результата разбора «Типология» — доступна по shareToken
// без логина. Контракт: GET /api/public/tip/shared/[token] ->
//   { resultMd, formula, context, name?, createdAt }
// formula форма (lib/tip/calculation.ts, TipFormula):
//   { day, month, year, fullDate — каждая {value, sourceDigits, intermediate},
//     formulaString, digitCounts, missingDigits, repeatedDigits }

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Share2, RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { renderTipMarkdown } from "@/components/tip/markdown"
import { getTipContext } from "@/lib/tip/contexts"

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

interface SharedResult {
  resultMd: string
  formula: TipFormula
  context: string
  name?: string
  createdAt: string
}

const POSITION_META: { key: keyof Pick<TipFormula, "day" | "month" | "year" | "fullDate">; label: string; hint: string }[] = [
  { key: "day", label: "День", hint: "Базовая природа" },
  { key: "month", label: "Месяц", hint: "Эмоции и контакт" },
  { key: "year", label: "Год", hint: "Социальная реализация" },
  { key: "fullDate", label: "Полная дата", hint: "Жизненная задача" },
]

export default function TipResultClient() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token
  const [data, setData] = useState<SharedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    const shareData = {
      title: "Мой разбор — Типология",
      text: "Посмотрите мой персональный разбор личности",
      url,
    }
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // пользователь отменил шеринг или API недоступно — фолбэк на копирование
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Ссылка скопирована")
    } catch {
      toast.error("Не удалось скопировать ссылку")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
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
  const html = renderTipMarkdown(data.resultMd)

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

      {/* ── Формула ── */}
      <section className="mb-8 rounded-2xl border border-stone-200 bg-stone-50/70 p-5 sm:p-6">
        <p className="mb-4 text-center font-mono text-3xl font-bold tracking-wider text-stone-900 sm:text-4xl">
          {data.formula.formulaString}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {POSITION_META.map(({ key, label, hint }) => {
            const pos = data.formula[key]
            return (
              <div key={key} className="rounded-xl border border-stone-200 bg-white p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{pos.value}</p>
                <p className="mt-1 text-xs font-semibold text-stone-700">{label}</p>
                <p className="text-[11px] text-stone-400">{hint}</p>
                {pos.sourceDigits.length > 0 && (
                  <p className="mt-2 text-[11px] text-stone-400">
                    {pos.sourceDigits.join(" + ")}
                    {pos.intermediate.length > 0 && ` = ${pos.intermediate.join(" = ")}`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Разбор ── */}
      {/* Разметка уже приходит со своими Tailwind-классами из renderTipMarkdown
          (не полагаемся на каскад .prose — там собственные явные стили). */}
      <article className="max-w-none" dangerouslySetInnerHTML={{ __html: html }} />

      {/* ── Действия ── */}
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button onClick={handleShare} variant="outline" className="flex-1 gap-2">
          <Share2 className="h-4 w-4" /> Поделиться
        </Button>
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
