"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { getCandidateByToken, type PublicCandidate } from "@/lib/candidate-tokens"
import { DEFAULT_LESSONS, replaceVars, type Lesson, type Block } from "@/lib/course-types"
import { getBrand, brandCssVars, type BrandConfig } from "@/lib/branding"
import { cn } from "@/lib/utils"
import {
  Play, ChevronLeft, ChevronRight, CheckCircle2, Calendar,
  Phone, Mail, MessageCircle, ArrowRight, Briefcase, Clock,
  PartyPopper, Zap,
} from "lucide-react"

type Screen = "welcome" | "reentry" | "lessons" | "final"

interface CandidateProgress {
  currentLesson: number
  completedLessons: number[]
  slotSelected?: string
  authenticated: boolean
}

function getStorageKey(token: string) {
  return `candidate_${token}`
}

function loadProgress(token: string): CandidateProgress {
  if (typeof window === "undefined") return { currentLesson: 0, completedLessons: [], authenticated: false }
  try {
    const raw = localStorage.getItem(getStorageKey(token))
    if (raw) return JSON.parse(raw)
  } catch {}
  return { currentLesson: 0, completedLessons: [], authenticated: false }
}

function saveProgress(token: string, progress: CandidateProgress) {
  if (typeof window === "undefined") return
  localStorage.setItem(getStorageKey(token), JSON.stringify(progress))
}

// Бренд — использует глобальные настройки
function getBrandStyles(candidate: PublicCandidate, globalBrand?: BrandConfig | null) {
  if (candidate.brandPlan === "trial") {
    return { color: "#3b82f6", bgColor: "#f0f4ff", textColor: "#1e293b", name: "Моя Команда", showBrandLogo: true, logoUrl: null as string | null }
  }
  const color = globalBrand?.primaryColor || candidate.brandColor
  const bgColor = globalBrand?.bgColor || "#f0f4ff"
  const textColor = globalBrand?.textColor || "#1e293b"
  const logoUrl = globalBrand?.logoUrl || null
  const name = globalBrand?.companyName || candidate.company
  return { color, bgColor, textColor, name, showBrandLogo: false, logoUrl }
}

export default function CandidatePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [candidate, setCandidate] = useState<PublicCandidate | null>(null)
  const [screen, setScreen] = useState<Screen>("welcome")
  const [progress, setProgress] = useState<CandidateProgress>({ currentLesson: 0, completedLessons: [], authenticated: false })
  const [loading, setLoading] = useState(true)
  const [globalBrand, setGlobalBrand] = useState<BrandConfig | null>(null)

  useEffect(() => {
    setGlobalBrand(getBrand())
    const c = getCandidateByToken(token)
    setCandidate(c)
    if (c) {
      const p = loadProgress(token)
      setProgress(p)
      if (p.slotSelected) setScreen("final")
      else if (p.completedLessons.length > 0) setScreen("lessons")
    }
    setLoading(false)
  }, [token])

  const updateProgress = (update: Partial<CandidateProgress>) => {
    setProgress(prev => {
      const next = { ...prev, ...update }
      saveProgress(token, next)
      return next
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="text-4xl mb-4">🔗</div>
            <h1 className="text-xl font-bold mb-2">Ссылка недействительна</h1>
            <p className="text-muted-foreground text-sm">Запросите новую ссылку у рекрутера.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const brand = getBrandStyles(candidate, globalBrand)

  if (screen === "welcome") {
    return <WelcomeScreen candidate={candidate} brand={brand} onStart={() => setScreen("lessons")} onReentry={() => setScreen("reentry")} />
  }

  if (screen === "reentry") {
    return (
      <ReentryScreen
        brand={brand}
        onSuccess={() => {
          updateProgress({ authenticated: true })
          const p = loadProgress(token)
          if (p.completedLessons.length > 0) setScreen("lessons")
          else setScreen("welcome")
        }}
        onBack={() => setScreen("welcome")}
      />
    )
  }

  if (screen === "final") {
    return <FinalScreen candidate={candidate} brand={brand} progress={progress} updateProgress={updateProgress} />
  }

  return (
    <LessonsScreen
      candidate={candidate}
      brand={brand}
      progress={progress}
      updateProgress={updateProgress}
      onComplete={() => setScreen("final")}
    />
  )
}

// ═══════════════════════════════════════
// Экран 1 — Приветствие
// ═══════════════════════════════════════
function WelcomeScreen({
  candidate, brand, onStart, onReentry,
}: {
  candidate: PublicCandidate
  brand: { color: string; bgColor: string; textColor: string; name: string; showBrandLogo: boolean; logoUrl: string | null }
  onStart: () => void
  onReentry: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ backgroundColor: brand.bgColor, color: brand.textColor }}>
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Логотип */}
        <div className="flex justify-center">
          {brand.showBrandLogo ? (
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${brand.color}, #6366f1)` }}>H</div>
              <span className="text-2xl font-bold" style={{ color: brand.textColor }}>Моя Команда</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="w-12 h-12 rounded-xl object-contain" />
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: brand.color }}>{brand.name[0]}</div>
              )}
              <span className="text-2xl font-bold" style={{ color: brand.textColor }}>{brand.name}</span>
            </div>
          )}
        </div>

        {/* Приветствие */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Привет, {candidate.firstName}! 👋
          </h1>
          <div className="space-y-1">
            <p className="text-lg text-muted-foreground font-medium">{candidate.position}</p>
            <p className="text-base text-muted-foreground">{candidate.company}</p>
          </div>
        </div>

        {/* Описание */}
        <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">~15 минут</span>
            </div>
            <p className="text-foreground text-base leading-relaxed">
              Короткий обзор — 15 минут. Узнаешь компанию, роль и доход.
            </p>
          </CardContent>
        </Card>

        {/* Кнопки */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold text-white rounded-xl shadow-lg"
            style={{ background: `linear-gradient(135deg, ${brand.color}, #6366f1)` }}
            onClick={onStart}
          >
            <Play className="w-5 h-5 mr-2" />
            Начать демонстрацию
          </Button>
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            onClick={onReentry}
          >
            Уже проходили? → Войти снова
          </button>
        </div>

        {/* Футер */}
        {brand.showBrandLogo && (
          <p className="text-xs text-muted-foreground/50 pt-4">
            Powered by Моя Команда
          </p>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// Повторный вход
// ═══════════════════════════════════════
function ReentryScreen({
  brand, onSuccess, onBack,
}: {
  brand: { color: string; name: string; showBrandLogo: boolean }
  onSuccess: () => void
  onBack: () => void
}) {
  const [tab, setTab] = useState("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [email, setEmail] = useState("")
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailCode, setEmailCode] = useState("")

  const handlePhoneSend = () => setCodeSent(true)
  const handlePhoneVerify = () => {
    if (code === "1234") onSuccess()
  }
  const handleEmailSend = () => setEmailCodeSent(true)
  const handleEmailVerify = () => {
    if (emailCode === "1234") onSuccess()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-md w-full space-y-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Назад
        </button>

        <h2 className="text-2xl font-bold text-foreground text-center">Войти снова</h2>
        <p className="text-center text-muted-foreground text-sm">Выберите способ входа</p>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="phone" className="text-xs"><Phone className="w-3.5 h-3.5 mr-1" />SMS</TabsTrigger>
            <TabsTrigger value="email" className="text-xs"><Mail className="w-3.5 h-3.5 mr-1" />Email</TabsTrigger>
            <TabsTrigger value="telegram" className="text-xs"><MessageCircle className="w-3.5 h-3.5 mr-1" />TG</TabsTrigger>
            <TabsTrigger value="hh" className="text-xs">🔴 hh.ru</TabsTrigger>
          </TabsList>

          <TabsContent value="phone" className="space-y-3 pt-4">
            {!codeSent ? (
              <>
                <Input placeholder="+7 (___) ___-__-__" value={phone} onChange={e => setPhone(e.target.value)} />
                <Button className="w-full" style={{ backgroundColor: brand.color }} onClick={handlePhoneSend}>
                  Отправить код
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">Код отправлен. Введите 1234</p>
                <Input placeholder="Код из SMS" value={code} onChange={e => setCode(e.target.value)} maxLength={4} />
                <Button className="w-full" style={{ backgroundColor: brand.color }} onClick={handlePhoneVerify}>
                  Войти
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="email" className="space-y-3 pt-4">
            {!emailCodeSent ? (
              <>
                <Input placeholder="email@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                <Button className="w-full" style={{ backgroundColor: brand.color }} onClick={handleEmailSend}>
                  Отправить код
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">Код отправлен. Введите 1234</p>
                <Input placeholder="Код из письма" value={emailCode} onChange={e => setEmailCode(e.target.value)} maxLength={4} />
                <Button className="w-full" style={{ backgroundColor: brand.color }} onClick={handleEmailVerify}>
                  Войти
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="telegram" className="space-y-3 pt-4 text-center">
            <div className="p-6 border rounded-xl bg-card">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 text-blue-500" />
              <p className="text-sm text-muted-foreground mb-4">Откройте Telegram-бот для авторизации</p>
              <Button className="w-full" variant="outline" onClick={onSuccess}>
                Открыть Telegram
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="hh" className="space-y-3 pt-4 text-center">
            <div className="p-6 border rounded-xl bg-card">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm">hh</div>
              <p className="text-sm text-muted-foreground mb-4">Войти через аккаунт hh.ru</p>
              <Button className="w-full bg-red-500 hover:bg-red-600 text-white" onClick={onSuccess}>
                🔴 Войти через hh.ru
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// Экран 2 — Уроки демонстрации
// ═══════════════════════════════════════
function LessonsScreen({
  candidate, brand, progress, updateProgress, onComplete,
}: {
  candidate: PublicCandidate
  brand: { color: string; name: string; showBrandLogo: boolean }
  progress: CandidateProgress
  updateProgress: (u: Partial<CandidateProgress>) => void
  onComplete: () => void
}) {
  const lessons = DEFAULT_LESSONS
  const [currentIdx, setCurrentIdx] = useState(progress.currentLesson)
  const totalLessons = lessons.length
  const lesson = lessons[currentIdx]
  const percent = Math.round(((currentIdx + 1) / totalLessons) * 100)

  const goNext = () => {
    const completed = [...new Set([...progress.completedLessons, currentIdx])]
    if (currentIdx < totalLessons - 1) {
      const nextIdx = currentIdx + 1
      setCurrentIdx(nextIdx)
      updateProgress({ currentLesson: nextIdx, completedLessons: completed })
    } else {
      updateProgress({ completedLessons: completed })
      onComplete()
    }
  }

  const goPrev = () => {
    if (currentIdx > 0) {
      const prevIdx = currentIdx - 1
      setCurrentIdx(prevIdx)
      updateProgress({ currentLesson: prevIdx })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Урок {currentIdx + 1} из {totalLessons} · {percent}%
            </span>
            <Badge variant="outline" className="text-xs">{candidate.company}</Badge>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-foreground">
            {lesson.emoji} {replaceVars(lesson.title)}
          </h2>

          {lesson.blocks.map(block => (
            <LessonBlock key={block.id} block={block} brandColor={brand.color} />
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 px-6"
            onClick={goPrev}
            disabled={currentIdx === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Назад
          </Button>
          <Button
            className="flex-1 h-12 text-base font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${brand.color}, #6366f1)` }}
            onClick={goNext}
          >
            {currentIdx === totalLessons - 1 ? (
              <>Завершить <CheckCircle2 className="w-4 h-4 ml-2" /></>
            ) : (
              <>Далее <ChevronRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Рендер блока урока
function LessonBlock({ block, brandColor }: { block: Block; brandColor: string }) {
  const content = replaceVars(block.content)

  if (block.type === "text") {
    return (
      <div
        className="prose prose-sm max-w-none text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, "<br/>") }}
      />
    )
  }

  if (block.type === "video") {
    if (!block.videoUrl) {
      return (
        <div className="aspect-video rounded-xl bg-muted/50 border border-dashed border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Play className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Видео будет добавлено</p>
          </div>
        </div>
      )
    }
    return (
      <div className="aspect-video rounded-xl overflow-hidden border">
        <iframe
          src={block.videoUrl}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  if (block.type === "image") {
    if (!block.imageUrl) {
      return (
        <div className="aspect-[16/9] rounded-xl bg-muted/50 border border-dashed border-border flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Изображение будет добавлено</p>
        </div>
      )
    }
    return (
      <div className={cn("rounded-xl overflow-hidden", block.imageLayout === "full" ? "" : "flex gap-4")}>
        <img src={block.imageUrl} alt={block.imageCaption || ""} className="rounded-xl max-w-full" />
        {block.imageCaption && <p className="text-xs text-muted-foreground mt-1">{block.imageCaption}</p>}
      </div>
    )
  }

  if (block.type === "info") {
    const styles: Record<string, string> = {
      info: "bg-blue-50 border-blue-200 text-blue-900",
      warning: "bg-amber-50 border-amber-200 text-amber-900",
      success: "bg-emerald-50 border-emerald-200 text-emerald-900",
      error: "bg-red-50 border-red-200 text-red-900",
    }
    return (
      <div className={cn("rounded-xl border p-4", styles[block.infoStyle])}>
        <div dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, "<br/>") }} className="text-sm leading-relaxed" />
      </div>
    )
  }

  if (block.type === "task") {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: brandColor }} />
            <span className="font-semibold text-sm">{replaceVars(block.taskDescription)}</span>
          </div>
          {block.questions.map(q => (
            <div key={q.id} className="space-y-2">
              <p className="text-sm text-foreground">{replaceVars(q.text)}</p>
              {q.answerType === "text" && (
                <textarea className="w-full border rounded-lg p-3 text-sm resize-none h-20 bg-background" placeholder="Ваш ответ..." />
              )}
              {q.answerType === "single" && (
                <div className="space-y-1.5">
                  {q.options.map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-muted/50">
                      <input type="radio" name={q.id} className="accent-blue-600" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {q.answerType === "video" && (
                <div className="border border-dashed rounded-lg p-4 text-center text-muted-foreground text-sm">
                  📹 Запись видео (заглушка)
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (block.type === "button") {
    return (
      <Button
        variant={block.buttonVariant === "outline" ? "outline" : "default"}
        className="w-full"
        style={block.buttonVariant === "primary" ? { backgroundColor: brandColor } : undefined}
      >
        {replaceVars(block.buttonText)}
      </Button>
    )
  }

  return null
}

// ═══════════════════════════════════════
// Экран 3 — Финал
// ═══════════════════════════════════════
function FinalScreen({
  candidate, brand, progress, updateProgress,
}: {
  candidate: PublicCandidate
  brand: { color: string; name: string; showBrandLogo: boolean }
  progress: CandidateProgress
  updateProgress: (u: Partial<CandidateProgress>) => void
}) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(progress.slotSelected || null)
  const [confirmed, setConfirmed] = useState(!!progress.slotSelected)

  // Генерируем 3 дня × 3 слота
  const today = new Date()
  const days = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i + 1)
    return d
  })
  const timeSlots = ["10:00", "14:00", "17:00"]

  const formatDay = (d: Date) => {
    const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    return `${weekdays[d.getDay()]}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`
  }

  const handleConfirm = () => {
    if (selectedSlot) {
      updateProgress({ slotSelected: selectedSlot })
      setConfirmed(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-lg w-full space-y-8 text-center">
        {confirmed ? (
          <>
            <PartyPopper className="w-16 h-16 mx-auto text-amber-500" />
            <h1 className="text-3xl font-bold text-foreground">
              Встреча запланирована! 🎉
            </h1>
            <p className="text-muted-foreground">
              {candidate.firstName}, мы ждём вас <span className="font-semibold text-foreground">{selectedSlot}</span>
            </p>
            <Card className="border-none shadow-lg">
              <CardContent className="pt-6 pb-6 space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{selectedSlot}</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <Briefcase className="w-5 h-5 text-muted-foreground" />
                  <span>{candidate.position} · {candidate.company}</span>
                </div>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground">
              HR-менеджер свяжется с вами для подтверждения. До встречи!
            </p>
          </>
        ) : (
          <>
            <div>
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4" style={{ color: brand.color }} />
              <h1 className="text-3xl font-bold text-foreground">
                Отлично, {candidate.firstName}! Вы прошли демонстрацию 🎉
              </h1>
              <p className="text-muted-foreground mt-3">
                Выберите удобное время для встречи с HR-менеджером
              </p>
            </div>

            {/* Планировщик слотов */}
            <Card className="border-none shadow-lg text-left">
              <CardContent className="pt-6 pb-6">
                <div className="space-y-4">
                  {days.map(day => (
                    <div key={day.toISOString()}>
                      <p className="text-sm font-medium text-muted-foreground mb-2">{formatDay(day)}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {timeSlots.map(time => {
                          const slotKey = `${formatDay(day)} ${time}`
                          const isSelected = selectedSlot === slotKey
                          return (
                            <button
                              key={slotKey}
                              className={cn(
                                "py-3 px-2 rounded-lg border text-sm font-medium transition-all",
                                isSelected
                                  ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200"
                                  : "border-border hover:border-blue-300 hover:bg-blue-50/50 text-foreground"
                              )}
                              onClick={() => setSelectedSlot(slotKey)}
                            >
                              {time}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button
              size="lg"
              className="w-full h-14 text-base font-semibold text-white rounded-xl"
              style={{ background: `linear-gradient(135deg, ${brand.color}, #6366f1)` }}
              disabled={!selectedSlot}
              onClick={handleConfirm}
            >
              <Calendar className="w-5 h-5 mr-2" />
              Запланировать встречу
            </Button>
          </>
        )}

        {brand.showBrandLogo && (
          <p className="text-xs text-muted-foreground/50 pt-4">Powered by Моя Команда</p>
        )}
      </div>
    </div>
  )
}
