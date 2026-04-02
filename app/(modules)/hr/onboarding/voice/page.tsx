"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, Mic, Loader2, CheckCircle2, X, ChevronLeft, ChevronRight } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recording {
  id: string
  label: string
  durationSec: number
}

type Stage = "record" | "processing" | "questions"

// ─── Mock follow-up questions ─────────────────────────────────────────────────

interface Question {
  id: string
  text: string
  type: "number" | "year" | "chips"
  chips?: string[]
}

const FOLLOW_UP_QUESTIONS: Question[] = [
  {
    id: "avg_check",
    text: "Какой средний чек сделки?",
    type: "number",
  },
  {
    id: "founded_year",
    text: "Как давно работает компания?",
    type: "year",
  },
  {
    id: "work_format",
    text: "Какой формат работы для менеджера?",
    type: "chips",
    chips: ["Офис", "Удалённо", "Гибрид"],
  },
]

// ─── Animated pulse ring ─────────────────────────────────────────────────────

function PulseRing({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <>
      <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
      <span className="absolute inset-[-8px] rounded-full bg-red-300/20 animate-pulse" />
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VoicePage() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>("record")
  const [isRecording, setIsRecording] = useState(false)
  const [recordSec, setRecordSec] = useState(0)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [processingStep, setProcessingStep] = useState(0)

  // Q&A state
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [chipAnswer, setChipAnswer] = useState<string>("")

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordIdRef = useRef(0)

  // ── Timer for recording simulation ──
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setRecordSec((s) => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  // ── Toggle recording ──
  const handleRecordToggle = () => {
    if (isRecording) {
      // Stop
      stopTimer()
      const dur = recordSec
      setIsRecording(false)
      setRecordSec(0)
      recordIdRef.current += 1
      const newRec: Recording = {
        id: `rec-${recordIdRef.current}`,
        label: `Запись ${recordings.length + 1}`,
        durationSec: dur,
      }
      setRecordings((prev) => [...prev, newRec])
    } else {
      // Start
      setRecordSec(0)
      setIsRecording(true)
      startTimer()
    }
  }

  const removeRecording = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id))
  }

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  // ── Processing simulation ──
  const handleProcess = async () => {
    setStage("processing")
    setProcessingStep(0)

    for (let i = 0; i < 3; i++) {
      setProcessingStep(i)
      await new Promise((r) => setTimeout(r, 700))
    }

    setProcessingStep(3)
    await new Promise((r) => setTimeout(r, 400))
    setStage("questions")
    setQIndex(0)
  }

  // ── Answer helpers ──
  const currentQ = FOLLOW_UP_QUESTIONS[qIndex]
  const isLastQ = qIndex === FOLLOW_UP_QUESTIONS.length - 1
  const totalQ = FOLLOW_UP_QUESTIONS.length

  const handleNextQ = () => {
    // Save chip answer if type is chips
    if (currentQ.type === "chips" && chipAnswer) {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: chipAnswer }))
    }
    if (!isLastQ) {
      setQIndex((i) => i + 1)
      setChipAnswer("")
    }
  }

  const handlePrevQ = () => {
    if (qIndex > 0) {
      setQIndex((i) => i - 1)
      setChipAnswer(answers[FOLLOW_UP_QUESTIONS[qIndex - 1].id] ?? "")
    }
  }

  const handleSkipQ = () => {
    if (!isLastQ) {
      setQIndex((i) => i + 1)
      setChipAnswer("")
    }
  }

  // ── Processing steps text ──
  const PROC_STEPS = [
    "🎙️ Читаем запись...",
    "📝 Извлекаем данные из речи...",
    "🔍 Сопоставляем с базой компаний...",
    "✅ Готово! Разобрали 16 из 23 полей",
  ]

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push("/onboarding/channel")}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              М
            </div>
            <span className="text-sm font-semibold text-foreground">Company24</span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="max-w-lg w-full space-y-8">

          {/* ════ STAGE: RECORD ════ */}
          {(stage === "record" || stage === "processing") && (
            <>
              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  Расскажите о компании и кого ищете
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                  Говорите свободно — как рассказали бы коллеге. Мы запишем, разберём
                  и зададим уточняющие вопросы.
                </p>
              </div>

              {/* Record button */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <PulseRing active={isRecording} />
                  <button
                    type="button"
                    onClick={stage === "record" ? handleRecordToggle : undefined}
                    disabled={stage === "processing"}
                    className={cn(
                      "relative w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg",
                      isRecording
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : stage === "processing"
                        ? "bg-muted text-muted-foreground cursor-default"
                        : "bg-white border-2 border-border hover:border-primary/40 text-foreground hover:shadow-xl"
                    )}
                  >
                    {stage === "processing" ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Mic className={cn("w-8 h-8", isRecording && "animate-pulse")} />
                    )}
                  </button>
                </div>

                {/* Status label */}
                <div className="text-center min-h-[2.5rem]">
                  {stage === "processing" ? (
                    <p className="text-sm text-muted-foreground">Обрабатываем запись...</p>
                  ) : isRecording ? (
                    <>
                      <p className="text-sm font-semibold text-red-600">
                        Запись... {recordSec}с
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        нажмите чтобы остановить
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Нажмите и говорите</p>
                  )}
                </div>
              </div>

              {/* Hint */}
              {stage !== "processing" && (
                <p className="text-center text-xs text-muted-foreground">
                  Обычно хватает 2–3 минут. Можно записать несколько сообщений подряд.
                </p>
              )}

              {/* Recorded clips list */}
              {recordings.length > 0 && stage !== "processing" && (
                <div className="space-y-2">
                  {recordings.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-border shadow-sm"
                    >
                      <span className="text-base">🎙️</span>
                      <span className="flex-1 text-sm text-foreground">
                        {rec.label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatDuration(rec.durationSec)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecording(rec.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                        aria-label="Удалить запись"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Processing steps (during processing) */}
              {stage === "processing" && (
                <div className="rounded-xl border border-border bg-white/80 p-5 space-y-3 shadow-sm">
                  {PROC_STEPS.map((step, i) => {
                    const isDone = i < processingStep
                    const isCurrent = i === processingStep
                    return (
                      <div
                        key={step}
                        className={cn(
                          "flex items-center gap-3 text-sm transition-opacity",
                          isDone || isCurrent ? "opacity-100" : "opacity-30"
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-muted flex-shrink-0" />
                        )}
                        <span className={cn(isCurrent && "font-medium text-foreground")}>
                          {step}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Process CTA */}
              {recordings.length > 0 && stage !== "processing" && (
                <Button
                  className="w-full h-12 font-semibold gap-2"
                  onClick={handleProcess}
                >
                  Обработать записи
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </>
          )}

          {/* ════ STAGE: QUESTIONS ════ */}
          {stage === "questions" && (
            <>
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <h1 className="text-xl font-bold text-foreground">
                    Разобрали! Заполнено 16 из 23 полей (70%)
                  </h1>
                </div>
                <p className="text-muted-foreground text-sm">
                  Осталось уточнить 5 моментов
                </p>
                <Progress value={70} className="h-2 max-w-xs mx-auto" />
              </div>

              {/* Question card */}
              <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-5">
                {/* Progress indicator */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Вопрос {qIndex + 1} из {totalQ}</span>
                  <div className="flex gap-1">
                    {FOLLOW_UP_QUESTIONS.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-5 h-1.5 rounded-full transition-all",
                          i < qIndex
                            ? "bg-primary"
                            : i === qIndex
                            ? "bg-primary/60"
                            : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <p className="text-lg font-semibold text-foreground">{currentQ.text}</p>

                {/* Answer input */}
                {currentQ.type === "number" && (
                  <Input
                    type="number"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                    }
                    placeholder="Введите сумму в рублях..."
                    className="h-11"
                  />
                )}

                {currentQ.type === "year" && (
                  <Input
                    type="number"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                    }
                    placeholder="Год основания, например 2010"
                    className="h-11"
                    min={1900}
                    max={new Date().getFullYear()}
                  />
                )}

                {currentQ.type === "chips" && currentQ.chips && (
                  <div className="flex flex-wrap gap-2">
                    {currentQ.chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setChipAnswer(chip)
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: chip }))
                        }}
                        className={cn(
                          "px-4 py-2 rounded-full border text-sm transition-all",
                          chipAnswer === chip || answers[currentQ.id] === chip
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handlePrevQ}
                    disabled={qIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Назад
                  </Button>

                  <button
                    type="button"
                    onClick={handleSkipQ}
                    disabled={isLastQ}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  >
                    Пропустить →
                  </button>

                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleNextQ}
                    disabled={isLastQ}
                  >
                    Далее
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Bottom action buttons */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setStage("record")
                    setRecordings([])
                    setIsRecording(false)
                    setRecordSec(0)
                  }}
                >
                  <Mic className="w-4 h-4" />
                  Продолжить голосом
                </Button>
                <Button
                  className="w-full gap-2"
                  onClick={() => router.push("/vacancies/create")}
                >
                  Заполнить на сайте
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => router.push("/vacancies/create")}
                >
                  Опубликовать как есть
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
