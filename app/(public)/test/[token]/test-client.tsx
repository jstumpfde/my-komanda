"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, CheckCircle2, Send, ChevronUp, ChevronDown } from "lucide-react"
import type { Block, Lesson, Question } from "@/lib/course-types"
import { renderTemplate } from "@/lib/template-renderer"

// Прохождение тестового задания кандидатом.
// Рендерит структурированные вопросы task-блоков (single/multiple/yesno/sort/
// short/long) по образцу demo-client (тот же контракт значений: множественные
// и порядок — строки через "|||", yesno — "yes"/"no"). Если у теста нет
// структурированных вопросов — fallback на единое текстовое поле (legacy).

const SEP = "|||"     // разделитель множественных значений (как в demo-client)
const MIN_LEN = 10    // минимум для legacy-textarea

interface TestData {
  candidateName: string
  vacancyTitle: string
  companyName: string
  brand: { primary?: string | null; bg?: string | null; text?: string | null }
  lessons: Lesson[]
  settings: { instructions: string; deadlineDays: number | null; responseFormat: string }
  alreadySubmitted: boolean
}

// ─── Рендер одного вопроса (порт QuestionInput из demo-client) ─────────────
function QuestionInput({
  question,
  value,
  onChange,
  primary,
}: {
  question: Question
  value: string
  onChange: (val: string) => void
  primary: string
}) {
  const type = question.answerType
  // Вариант «Другое (с полем ввода)» — при выборе показываем поле для свободного
  // ответа. Явная пометка — question.otherOptions (индексы), заданная в
  // конструкторе; fallback — старая эвристика по слову «друго». Кастомный текст
  // храним как «<вариант>: <текст>» (читаемо для AI и карточки).
  const otherIdx = (i: number, o: string) => (question.otherOptions?.includes(i) ?? false) || /^друго/i.test((o ?? "").trim())
  const otherPh = question.otherPlaceholder?.trim() || "Уточните…"
  const otherInputCls = "ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-black/15 bg-white p-2 text-sm outline-none focus:border-black/30 text-slate-900"

  if (type === "single") {
    const sel = (opt: string) => value === opt || value.startsWith(opt + ":")
    const otherTxt = (opt: string) => {
      if (!value.startsWith(opt)) return ""
      const idx = value.indexOf(":")
      return idx >= 0 ? value.slice(idx + 1).trim() : ""
    }
    return (
      <div className="space-y-1.5">
        {question.options.map((opt, i) => (
          <div key={i} className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name={question.id}
                checked={sel(opt)}
                onChange={() => onChange(opt)}
                className="w-4 h-4"
                style={{ accentColor: primary }}
              />
              <span>{opt}</span>
            </label>
            {otherIdx(i, opt) && sel(opt) && (
              <input
                type="text"
                value={otherTxt(opt)}
                onChange={(e) => onChange(e.target.value.trim() ? `${opt}: ${e.target.value}` : opt)}
                placeholder={otherPh}
                className={otherInputCls}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === "multiple") {
    const selected = value ? value.split(SEP) : []
    const segFor = (opt: string) => selected.find((s) => s === opt || s.startsWith(opt + ":"))
    const isChecked = (opt: string) => segFor(opt) !== undefined
    const commit = (next: string[]) => onChange(next.filter(Boolean).join(SEP))
    const toggle = (opt: string) => {
      if (isChecked(opt)) {
        commit(selected.filter((s) => !(s === opt || s.startsWith(opt + ":"))))
      } else {
        commit([...selected, opt])
      }
    }
    const otherTxt = (opt: string) => {
      const seg = segFor(opt)
      if (!seg) return ""
      const idx = seg.indexOf(":")
      return idx >= 0 ? seg.slice(idx + 1).trim() : ""
    }
    const setOtherTxt = (opt: string, txt: string) => {
      const without = selected.filter((s) => !(s === opt || s.startsWith(opt + ":")))
      commit([...without, txt.trim() ? `${opt}: ${txt}` : opt])
    }
    return (
      <div className="space-y-1.5">
        {question.options.map((opt, i) => (
          <div key={i} className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={isChecked(opt)}
                onChange={() => toggle(opt)}
                className="w-4 h-4"
                style={{ accentColor: primary }}
              />
              <span>{opt}</span>
            </label>
            {otherIdx(i, opt) && isChecked(opt) && (
              <input
                type="text"
                value={otherTxt(opt)}
                onChange={(e) => setOtherTxt(opt, e.target.value)}
                placeholder={otherPh}
                className={otherInputCls}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === "sort") {
    // Порядок хранится как строки через SEP (как в demo-client).
    const current = value ? value.split(SEP) : [...question.options]
    for (const opt of question.options) {
      if (!current.includes(opt)) current.push(opt)
    }
    const order = current.filter((o) => question.options.includes(o))
    const move = (idx: number, dir: -1 | 1) => {
      const j = idx + dir
      if (j < 0 || j >= order.length) return
      const next = [...order]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      onChange(next.join(SEP))
    }
    return (
      <div className="space-y-1.5">
        <p className="text-xs opacity-60">Расставьте в правильном порядке</p>
        {order.map((opt, i) => (
          <div key={opt} className="flex items-center gap-2 rounded-lg border border-black/15 bg-white p-2 text-sm text-slate-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: primary }}>{i + 1}</span>
            <span className="flex-1">{opt}</span>
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Вверх">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="disabled:opacity-30" aria-label="Вниз">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (type === "yesno") {
    // value хранится как "yes"/"no" (совпадает с demo-client).
    return (
      <div className="flex gap-4">
        {[{ v: "yes", label: "Да" }, { v: "no", label: "Нет" }].map((o) => (
          <label key={o.v} className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              name={question.id}
              checked={value === o.v}
              onChange={() => onChange(o.v)}
              className="w-4 h-4"
              style={{ accentColor: primary }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    )
  }

  // short, long, text (legacy "video" обрабатываем как текст)
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ваш ответ…"
      rows={type === "long" ? 5 : 2}
      className="w-full rounded-lg border border-black/15 bg-white p-2.5 text-sm outline-none focus:border-black/30 text-slate-900"
    />
  )
}

export function TestClient({ token }: { token: string }) {
  const [data, setData] = useState<TestData | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "done">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({}) // questionId → value
  const [answer, setAnswer] = useState("")                            // legacy textarea
  const [submitting, setSubmitting] = useState(false)

  // ── Name-gate для анонимных кандидатов («Новый кандидат») ──
  const [nameGate, setNameGate] = useState<"idle" | "show" | "done">("idle")
  const [gateName, setGateName] = useState("")
  const [gatePhone, setGatePhone] = useState("")
  const [gateSubmitting, setGateSubmitting] = useState(false)
  const [gateError, setGateError] = useState("")

  useEffect(() => {
    fetch(`/api/public/test/${token}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) { setErrorMsg(json?.error || "Тест недоступен"); setStatus("error"); return }
        const d = (json?.data ?? json) as TestData
        setData(d)
        // В предпросмотре (?as=hr) всегда показываем форму, даже если превью-
        // кандидат уже «отправлял» — иначе HR не сможет повторно посмотреть
        // страницу с вопросами (видел бы только экран «Спасибо»).
        const isPreview = new URLSearchParams(window.location.search).get("as") === "hr"
        setStatus(d.alreadySubmitted && !isPreview ? "done" : "ready")
        // Показать gate для анонимных (имя-заглушка) — кроме превью HR
        if (!isPreview && (!d.candidateName.trim() || d.candidateName === "Новый кандидат")) {
          setNameGate("show")
        }
      })
      .catch(() => { setErrorMsg("Ошибка сети"); setStatus("error") })
  }, [token])

  // Последний урок теста = экран «Спасибо», который показывается ПОСЛЕ отправки
  // (если уроков больше одного). HR редактирует его как обычный урок. Форма
  // (вопросы + кнопка отправки) — все уроки, КРОМЕ последнего. Если урок один —
  // отдельного «спасибо»-экрана нет, показываем встроенный.
  const { formLessons, thankYouLesson } = useMemo(() => {
    const all = data?.lessons ?? []
    if (all.length > 1) {
      return { formLessons: all.slice(0, -1), thankYouLesson: all[all.length - 1] as Lesson }
    }
    return { formLessons: all, thankYouLesson: null as Lesson | null }
  }, [data])

  // Все вопросы task-блоков формы (с привязкой к blockId).
  const questions = useMemo(() => {
    const out: { blockId: string; q: Question }[] = []
    for (const lesson of formLessons) {
      for (const b of (lesson.blocks ?? []) as Block[]) {
        if (b.type === "task" && Array.isArray(b.questions)) {
          for (const q of b.questions) out.push({ blockId: b.id, q })
        }
      }
    }
    return out
  }, [formLessons])

  // Кастомная кнопка отправки: если HR добавил в конструктор блок «Кнопка»,
  // используем ЕГО как кнопку отправки (текст/цвет/стиль редактируются), а
  // встроенную дефолтную прячем. Так HR управляет видом кнопки.
  const hasCustomSubmitButton = useMemo(() => {
    for (const lesson of formLessons) {
      for (const b of (lesson.blocks ?? []) as Block[]) {
        if (b.type === "button") return true
      }
    }
    return false
  }, [formLessons])

  const hasStructured = questions.length > 0

  const setQ = (id: string, val: string) => setAnswers((prev) => ({ ...prev, [id]: val }))

  const requiredMissing = hasStructured
    ? questions.some(({ q }) => q.required && !(answers[q.id] ?? "").trim())
    : false
  const anyAnswered = hasStructured
    ? questions.some(({ q }) => (answers[q.id] ?? "").trim().length > 0)
    : answer.trim().length >= MIN_LEN
  const canSubmit = hasStructured ? (anyAnswered && !requiredMissing) : anyAnswered

  const submitGate = async () => {
    if (!gateName.trim()) return
    setGateSubmitting(true)
    setGateError("")
    try {
      const r = await fetch(`/api/public/candidate-update/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: gateName.trim(), phone: gatePhone.trim() || undefined }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok) { setGateError(json?.error || "Не удалось сохранить"); setGateSubmitting(false); return }
      // Обновляем локальное имя чтобы шаблоны {{Имя}} заработали
      setData(prev => prev ? { ...prev, candidateName: gateName.trim() } : prev)
      setNameGate("done")
    } catch {
      setGateError("Ошибка сети"); setGateSubmitting(false)
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setErrorMsg("")
    try {
      const payload = hasStructured
        ? {
            structuredAnswers: questions.map(({ blockId, q }) => ({
              blockId,
              questionId: q.id,
              answerType: q.answerType,
              value: answers[q.id] ?? "",
            })),
          }
        : { answerText: answer }

      const r = await fetch(`/api/public/test/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok) { setErrorMsg(json?.error || "Не удалось отправить"); setSubmitting(false); return }
      setStatus("done")
    } catch {
      setErrorMsg("Ошибка сети"); setSubmitting(false)
    }
  }

  // Автосохранение черновика: фиксируем ответы у себя по ходу заполнения,
  // даже если кандидат не нажал «Отправить». Дебаунс ~0.9с — пишем после
  // паузы в наборе. Превью HR (?as=hr) не сохраняем. Срабатывает только когда
  // есть хотя бы один ответ (отметку «перешёл» ставит GET при открытии).
  useEffect(() => {
    if (status !== "ready" || !anyAnswered) return
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("as") === "hr") return
    const payload = hasStructured
      ? {
          structuredAnswers: questions.map(({ blockId, q }) => ({
            blockId,
            questionId: q.id,
            answerType: q.answerType,
            value: answers[q.id] ?? "",
          })),
        }
      : { answerText: answer }
    const t = setTimeout(() => {
      fetch(`/api/public/test/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => { /* черновик не критичен — тихо игнорируем сбой сети */ })
    }, 900)
    return () => clearTimeout(t)
  }, [answers, answer, status, anyAnswered, hasStructured, questions, token])

  const bg = data?.brand?.bg || "#f8fafc"
  const text = data?.brand?.text || "#0f172a"
  const primary = data?.brand?.primary || "#2563eb"

  // Подстановка плейсхолдеров в тексты, заданные HR ({{Имя}}/{{name}},
  // {{вакансия}}, {{компания}}). Без неё кандидат видел бы буквально «{{Имя}}».
  const tplVars: Record<string, string> = {
    name:    data?.candidateName || "",
    vacancy: data?.vacancyTitle || "",
    company: data?.companyName || "",
  }
  const tpl = (s: string | undefined | null) => renderTemplate(s ?? "", tplVars)

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
    // Если HR задал финальный урок «Спасибо» — показываем ЕГО (контент из
    // конструктора, с подстановкой имени). Иначе — встроенный экран.
    if (thankYouLesson) {
      return (
        <div className="min-h-screen" style={{ backgroundColor: bg, color: text }}>
          <div className="max-w-2xl mx-auto px-4 py-10 space-y-3">
            {data?.companyName && <p className="text-xs uppercase tracking-wider opacity-60">{data.companyName}</p>}
            {/* Заголовок-название урока НЕ показываем: это внутреннее имя
                («Благодарю»), а текст благодарности HR пишет в блоке ниже. */}
            {((thankYouLesson.blocks ?? []) as Block[]).map((b, bi) => {
              const html = typeof b.content === "string" ? b.content : ""
              const tTitle = b.taskTitle?.trim()
              const tDesc = b.taskDescription?.trim()
              if (!html && !tTitle && !tDesc) return null
              return (
                <div key={b.id ?? bi} className="space-y-2">
                  {html && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: tpl(html) }} />}
                  {tTitle && <p className="font-medium">{tpl(tTitle)}</p>}
                  {tDesc && <p className="text-sm opacity-80 whitespace-pre-wrap">{tpl(tDesc)}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3" style={{ backgroundColor: bg, color: text }}>
        <CheckCircle2 className="w-12 h-12" style={{ color: primary }} />
        <h1 className="text-xl font-bold">Спасибо!</h1>
        <p className="text-sm opacity-80 max-w-md">Мы рассмотрим ваш ответ и свяжемся с вами.</p>
      </div>
    )
  }

  // Gate: запрашиваем имя у анонимного кандидата перед показом теста
  if (status === "ready" && nameGate === "show") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: bg, color: text }}>
        <div className="w-full max-w-sm space-y-5">
          {data?.companyName && (
            <p className="text-xs uppercase tracking-wider opacity-60 text-center">{data.companyName}</p>
          )}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold">Представьтесь</h2>
            <p className="text-sm opacity-70">Укажите ваши данные перед началом теста</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">
                Имя <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={gateName}
                onChange={e => setGateName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full rounded-lg border border-black/15 bg-white p-2.5 text-sm outline-none focus:border-black/30 text-slate-900"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">Телефон</label>
              <input
                type="tel"
                value={gatePhone}
                onChange={e => setGatePhone(e.target.value)}
                placeholder="+7 999 000-00-00"
                className="w-full rounded-lg border border-black/15 bg-white p-2.5 text-sm outline-none focus:border-black/30 text-slate-900"
              />
            </div>
            <button
              onClick={submitGate}
              disabled={!gateName.trim() || gateSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              {gateSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Продолжить
            </button>
            {gateError && <p className="text-sm text-red-600">{gateError}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg, color: text }}>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Только контент из конструктора: заголовки и тексты задаёт HR сам.
            Системную «обёртку» (авто-заголовок «Тестовое задание — вакансия»,
            срок, отдельный блок инструкций) не показываем — её просили убрать.
            Оставляем лишь брендовую строку с названием компании. */}
        {data?.companyName && (
          <p className="text-xs uppercase tracking-wider opacity-60">{data.companyName}</p>
        )}

        {/* Уроки теста: текст/HTML контент + интерактивные task-блоки */}
        {formLessons.map((lesson, li) => (
          <section key={lesson.id ?? li} className="space-y-3">
            {lesson.title && <h2 className="text-lg font-semibold">{tpl(lesson.title)}</h2>}
            {((lesson.blocks ?? []) as Block[]).map((b, bi) => {
              if (b.type === "task" && Array.isArray(b.questions) && b.questions.length > 0) {
                return (
                  <div key={b.id ?? bi} className="space-y-4 rounded-lg border border-black/10 bg-white/60 p-4">
                    {b.taskTitle?.trim() && <h3 className="font-semibold">{tpl(b.taskTitle)}</h3>}
                    {b.taskDescription?.trim() && (
                      <p className="text-sm opacity-80 whitespace-pre-wrap">{tpl(b.taskDescription)}</p>
                    )}
                    {b.questions.map((q) => (
                      <div key={q.id} className="space-y-1.5">
                        <label className="text-sm font-medium block">
                          {q.text}{q.required && <span className="text-red-500"> *</span>}
                        </label>
                        <QuestionInput
                          question={q}
                          value={answers[q.id] ?? ""}
                          onChange={(val) => setQ(q.id, val)}
                          primary={primary}
                        />
                      </div>
                    ))}
                  </div>
                )
              }
              // Блок «Кнопка» → кнопка отправки ответов (текст/цвет из конструктора).
              // URL блока игнорируем: это сабмит теста, а не ссылка.
              if (b.type === "button") {
                const label = b.buttonText?.trim() || "Отправить"
                const isOutline = b.buttonVariant === "outline"
                const color = b.buttonColor || primary
                const align = b.buttonAlign || "left"
                const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"
                return (
                  <div key={b.id ?? bi} className="pt-2 space-y-1">
                    <div className={`flex ${justify}`}>
                      <button
                        onClick={submit}
                        disabled={submitting || !canSubmit}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                        style={isOutline ? { border: `1px solid ${color}`, color } : { backgroundColor: color, color: "#fff" }}
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {label}
                      </button>
                    </div>
                    {hasStructured && requiredMissing && (
                      <p className={`text-xs opacity-60 flex ${justify}`}>Ответьте на обязательные вопросы (*)</p>
                    )}
                  </div>
                )
              }
              // Не-task блок: показываем текст/HTML контент (read-only).
              const html = typeof b.content === "string" ? b.content : ""
              const taskTitle = b.taskTitle?.trim()
              const taskDesc = b.taskDescription?.trim()
              if (!html && !taskTitle && !taskDesc) return null
              return (
                <div key={b.id ?? bi} className="space-y-2">
                  {html && <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: tpl(html) }} />}
                  {taskTitle && <p className="font-medium">{tpl(taskTitle)}</p>}
                  {taskDesc && <p className="text-sm opacity-80 whitespace-pre-wrap">{tpl(taskDesc)}</p>}
                </div>
              )
            })}
          </section>
        ))}

        {/* Legacy: единое текстовое поле, если структурированных вопросов нет */}
        {!hasStructured && (
          <div className="space-y-2 border-t border-black/10 pt-5">
            <label className="text-sm font-medium">Ваш ответ</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={8}
              placeholder="Напишите ваш ответ на задание…"
              className="w-full rounded-lg border border-black/15 bg-white p-3 text-sm outline-none focus:border-black/30 text-slate-900"
            />
            <span className="text-xs opacity-60">{answer.trim().length < MIN_LEN ? `Минимум ${MIN_LEN} символов` : " "}</span>
          </div>
        )}

        {/* Встроенная кнопка отправки — только если HR не добавил свою (блок «Кнопка»). */}
        {!hasCustomSubmitButton && (
        <div className="border-t border-black/10 pt-5 flex items-center justify-between">
          <span className="text-xs opacity-60">
            {hasStructured && requiredMissing ? "Ответьте на обязательные вопросы (*)" : " "}
          </span>
          <button
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить
          </button>
        </div>
        )}

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      </div>
    </div>
  )
}
