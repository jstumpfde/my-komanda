"use client"

// Клиентская часть мастера подключения — три шага, прогресс-индикатор сверху.
// Шаг 1 — переиспользует ConnectorsClient (тот же компонент, что на /ai-rop/connectors,
// та же логика/API — здесь никакого форка). Шаг 2 — запускает первичный импорт
// (POST /api/modules/ai-rop/trial/import). Шаг 3 — сводка «что мы нашли» (GET
// /api/modules/ai-rop/trial/summary) + переброс на /ai-rop/attention и /ai-rop/deals.
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Check, Loader2, Mail, ArrowRight, Compass, Workflow, Radio,
  MessageSquareText, Users2, Target, AlertTriangle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConnectorsClient, type ConnectorRow } from "../../connectors/_components/connectors-client"

const STEPS = [
  { n: 1, title: "Подключите канал" },
  { n: 2, title: "Читаем историю" },
  { n: 3, title: "Что мы нашли" },
] as const

const CATEGORY_LABELS: Record<string, string> = {
  promise_overdue: "Обещали и забыли",
  deal_silent: "Сделка молчит",
  discrepancy: "Расхождение с CRM",
  weak_call: "Слабый звонок",
  negative_trend: "Настроение ухудшается",
  checklist_gap: "Провал по чек-листу",
}

interface AttentionItemLike {
  id: string
  category: string
  text: string
  urgent: boolean
  href: string
}

interface TrialSummary {
  channelsConnected: number
  messagesRead: number
  dealsFound: number
  dealsNotInCrm: number
  counterpartiesFound: number
  attentionPointsFound: number
  topAttentionItems: AttentionItemLike[]
}

interface ImportResult {
  connectorsProcessed: number
  inserted: number
  skipped: number
  errors: string[]
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex flex-1 items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.n < current
                  ? "bg-emerald-600 text-white"
                  : s.n === current
                    ? "bg-violet-600 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.n < current ? <Check className="size-4" /> : s.n}
            </div>
            <span className={`text-sm ${s.n === current ? "font-semibold" : "text-muted-foreground"}`}>{s.title}</span>
          </div>
          {i < STEPS.length - 1 && <div className="mx-2 h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  )
}

export function OnboardingWizard({ initialConnectors }: { initialConnectors: ConnectorRow[] }) {
  const [step, setStep] = useState<1 | 2 | 3>(initialConnectors.length > 0 ? 2 : 1)

  return (
    <div className="max-w-3xl">
      <Stepper current={step} />

      {step === 1 && <Step1Connect initialConnectors={initialConnectors} onNext={() => setStep(2)} />}
      {step === 2 && <Step2Import onDone={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <Step3Summary />}
    </div>
  )
}

function Step1Connect({ initialConnectors, onNext }: { initialConnectors: ConnectorRow[]; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-violet-200 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/10">
        <CardContent className="flex items-start gap-3 py-4">
          <Mail className="mt-0.5 size-5 shrink-0 text-violet-600" />
          <div className="text-sm leading-relaxed">
            Подключите почту, Telegram или WhatsApp — именно там, скорее всего, и происходит настоящее
            общение с клиентами, которое CRM не всегда видит. Ничего не публикуем и не рассылаем —
            только читаем переписку.
          </div>
        </CardContent>
      </Card>

      {/* ConnectorsClient — тот же компонент, что на /ai-rop/connectors: сам управляет
          своим состоянием (добавление/проверка/удаление), колбэка наружу не даёт.
          Кнопка «Далее» здесь не завязана на его внутренний список — так проще и
          надёжнее, чем тянуть состояние наружу форком компонента; шаг 2 всё равно
          берёт коннекторы компании из БД, а не из пропсов мастера. */}
      <ConnectorsClient initialConnectors={initialConnectors} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {initialConnectors.length > 0
            ? "Можно подключить ещё один канал или сразу перейти дальше."
            : "Добавьте хотя бы один канал выше, затем нажмите «Далее»."}
        </p>
        <Button onClick={onNext} className="gap-1.5">
          Далее — читаем историю <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function Step2Import({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runImport() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/modules/ai-rop/trial/import", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Не удалось прочитать историю")
        return
      }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {!result && !busy && (
            <>
              <Radio className="size-8 text-violet-600" />
              <div className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Сейчас мы подключимся к вашей почте и прочитаем последние сообщения — это займёт около
                минуты. Telegram и WhatsApp начинают приходить сами, как только вы их подключили.
              </div>
              <Button onClick={runImport} className="gap-1.5">Начать чтение истории</Button>
            </>
          )}
          {busy && (
            <>
              <Loader2 className="size-8 animate-spin text-violet-600" />
              <div className="text-sm text-muted-foreground">Читаем историю переписки — обычно это до минуты…</div>
            </>
          )}
          {result && !busy && (
            <>
              <Check className="size-8 text-emerald-600" />
              <div className="text-sm leading-relaxed">
                Готово: {result.inserted > 0
                  ? <>нашли и прочитали <b>{result.inserted}</b> {msgWord(result.inserted)} по {result.connectorsProcessed} {connWord(result.connectorsProcessed)}.</>
                  : <>писем с почты для чтения пока не нашлось — если вы подключали Telegram/WhatsApp, сообщения появятся по мере переписки.</>}
              </div>
              {result.errors.length > 0 && (
                <div className="max-w-md text-xs text-amber-600 dark:text-amber-400">
                  {result.errors[0]}
                </div>
              )}
              <Button onClick={onDone} className="gap-1.5">
                Смотреть, что нашли <ArrowRight className="size-4" />
              </Button>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      <div className="flex justify-start">
        <Button variant="ghost" size="sm" onClick={onBack}>Назад</Button>
      </div>
    </div>
  )
}

function msgWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return "сообщений"
  if (last === 1) return "сообщение"
  if (last >= 2 && last <= 4) return "сообщения"
  return "сообщений"
}
function connWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return "каналам"
  if (last === 1) return "каналу"
  return "каналам"
}

function Step3Summary() {
  const [summary, setSummary] = useState<TrialSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/ai-rop/trial/summary")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok) setSummary(data.summary)
        else setError(data?.error || "Не удалось загрузить сводку")
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!summary) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Считаем итоги…
      </div>
    )
  }

  const tiles = [
    { icon: Radio, label: "Каналов подключено", value: summary.channelsConnected },
    { icon: MessageSquareText, label: "Сообщений прочитано", value: summary.messagesRead },
    { icon: Workflow, label: "Сделок обнаружено", value: summary.dealsFound },
    { icon: Users2, label: "Контрагентов найдено", value: summary.counterpartiesFound },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
              <t.icon className="size-4 text-violet-600" />
              <div className="text-2xl font-semibold">{t.value}</div>
              <div className="text-xs text-muted-foreground">{t.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.dealsNotInCrm > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="text-sm leading-relaxed">
              Из них <b>{summary.dealsNotInCrm}</b> {dealWord(summary.dealsNotInCrm)} — переписка с реальными
              сделками, которых <b>нет в CRM</b>. Это то, что менеджеры ведут «в личке» и что раньше было
              не видно вообще никому, кроме них самих.
            </div>
          </CardContent>
        </Card>
      )}

      {summary.attentionPointsFound > 0 && (
        <Card className="border-violet-200 dark:border-violet-900/40">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-violet-600" />
              <div className="text-sm font-medium">
                Найдено {summary.attentionPointsFound} {pointWord(summary.attentionPointsFound)} внимания
              </div>
            </div>
            {summary.topAttentionItems.length > 0 && (
              <ul className="flex flex-col gap-2">
                {summary.topAttentionItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    {item.urgent
                      ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-500" />
                      : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />}
                    <span>
                      <span className="text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}:</span>{" "}
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild className="gap-1.5">
          <Link href="/ai-rop/attention"><Compass className="size-4" /> Смотреть точки внимания</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/ai-rop/deals"><Workflow className="size-4" /> Смотреть сделки</Link>
        </Button>
      </div>
    </div>
  )
}

function dealWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return "сделок"
  if (last === 1) return "сделка"
  if (last >= 2 && last <= 4) return "сделки"
  return "сделок"
}
function pointWord(n: number): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return "точек"
  if (last === 1) return "точка"
  if (last >= 2 && last <= 4) return "точки"
  return "точек"
}
