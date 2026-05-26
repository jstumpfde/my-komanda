"use client"

import { useEffect, useState } from "react"
import { Loader2, CheckCircle2, Send } from "lucide-react"

// Этап 1 (базово): простой read-only рендер уроков теста + поле ответа.
// Намеренно проще demo-client: без AI-чата и медиаплеера — текст/HTML контент
// (то, что HR обычно кладёт в задание). Богатый медиарендер — позже.

interface Block { type?: string; content?: string; taskTitle?: string; taskDescription?: string }
interface Lesson { id?: string; emoji?: string; title?: string; blocks?: Block[] }
interface TestData {
  candidateName: string
  vacancyTitle: string
  companyName: string
  brand: { primary?: string | null; bg?: string | null; text?: string | null }
  lessons: Lesson[]
  settings: { instructions: string; deadlineDays: number | null; responseFormat: string }
  alreadySubmitted: boolean
}

const MIN_LEN = 10

export function TestClient({ token }: { token: string }) {
  const [data, setData] = useState<TestData | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "done">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [answer, setAnswer] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/public/test/${token}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) { setErrorMsg(json?.error || "Тест недоступен"); setStatus("error"); return }
        const d = (json?.data ?? json) as TestData
        setData(d)
        setStatus(d.alreadySubmitted ? "done" : "ready")
      })
      .catch(() => { setErrorMsg("Ошибка сети"); setStatus("error") })
  }, [token])

  const submit = async () => {
    if (answer.trim().length < MIN_LEN) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/public/test/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerText: answer }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok) { setErrorMsg(json?.error || "Не удалось отправить"); setSubmitting(false); return }
      setStatus("done")
    } catch {
      setErrorMsg("Ошибка сети"); setSubmitting(false)
    }
  }

  const bg = data?.brand?.bg || "#f8fafc"
  const text = data?.brand?.text || "#0f172a"
  const primary = data?.brand?.primary || "#2563eb"

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
      </div>
    )
  }

  if (status === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3" style={{ backgroundColor: bg, color: text }}>
        <CheckCircle2 className="w-12 h-12" style={{ color: primary }} />
        <h1 className="text-xl font-bold">Спасибо!</h1>
        <p className="text-sm opacity-80 max-w-md">Мы рассмотрим ваш ответ и свяжемся с вами.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg, color: text }}>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          {data?.companyName && <p className="text-xs uppercase tracking-wider opacity-60">{data.companyName}</p>}
          <h1 className="text-2xl font-bold">Тестовое задание{data?.vacancyTitle ? ` — ${data.vacancyTitle}` : ""}</h1>
          {data?.settings.deadlineDays != null && (
            <p className="text-xs opacity-70">Срок выполнения: {data.settings.deadlineDays} дн.</p>
          )}
        </header>

        {data?.settings.instructions && (
          <div className="rounded-lg border border-black/10 bg-white/60 p-4 text-sm whitespace-pre-wrap">{data.settings.instructions}</div>
        )}

        {/* Read-only контент уроков теста (текст/HTML — базовый рендер). */}
        {data?.lessons.map((lesson, li) => (
          <section key={lesson.id ?? li} className="space-y-3">
            {lesson.title && <h2 className="text-lg font-semibold">{lesson.emoji ? `${lesson.emoji} ` : ""}{lesson.title}</h2>}
            {(lesson.blocks ?? []).map((b, bi) => {
              const html = typeof b.content === "string" ? b.content : ""
              const taskTitle = b.taskTitle?.trim()
              const taskDesc = b.taskDescription?.trim()
              return (
                <div key={bi} className="space-y-2">
                  {html && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />}
                  {taskTitle && <p className="font-medium">{taskTitle}</p>}
                  {taskDesc && <p className="text-sm opacity-80 whitespace-pre-wrap">{taskDesc}</p>}
                </div>
              )
            })}
          </section>
        ))}

        {/* Поле ответа */}
        <div className="space-y-2 border-t border-black/10 pt-5">
          <label className="text-sm font-medium">Ваш ответ</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={8}
            placeholder="Напишите ваш ответ на задание…"
            className="w-full rounded-lg border border-black/15 bg-white p-3 text-sm outline-none focus:border-black/30 text-slate-900"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-60">{answer.trim().length < MIN_LEN ? `Минимум ${MIN_LEN} символов` : " "}</span>
            <button
              onClick={submit}
              disabled={submitting || answer.trim().length < MIN_LEN}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
