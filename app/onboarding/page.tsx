"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ONBOARDING_STEPS, getOnboarding, saveOnboarding, type OnboardingState } from "@/lib/onboarding"
import {
  Building2, Briefcase, Link2, Play, PartyPopper, ArrowRight,
  Upload, Search, Loader2, Check, SkipForward,
} from "lucide-react"

const STEP_ICONS = [Building2, Briefcase, Link2, Play, PartyPopper]

const DEMO_TEMPLATES = [
  { id: "sales", emoji: "💼", title: "Менеджер по продажам (B2B)" },
  { id: "telemarketing", emoji: "📞", title: "Телемаркетолог" },
  { id: "client", emoji: "🤝", title: "Клиентский менеджер" },
  { id: "warehouse", emoji: "📦", title: "Логист / Склад" },
  { id: "it", emoji: "💻", title: "IT-специалист" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [state, setState] = useState<OnboardingState>({ completed: [], skipped: [] })

  // Step 1 fields
  const [companyName, setCompanyName] = useState("ООО Ромашка")
  const [inn, setInn] = useState("")
  const [city, setCity] = useState("")
  const [innLoading, setInnLoading] = useState(false)

  // Step 2
  const [vacancyTitle, setVacancyTitle] = useState("")
  const [vacancyCity, setVacancyCity] = useState("")

  // Step 3
  const [hhConnecting, setHhConnecting] = useState(false)
  const [hhConnected, setHhConnected] = useState(false)

  // Step 4
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  useEffect(() => {
    const saved = getOnboarding()
    setState(saved)
    // Find first incomplete step
    const firstIncomplete = ONBOARDING_STEPS.findIndex(s => s.id !== "done" && !saved.completed.includes(s.id) && !saved.skipped.includes(s.id))
    if (firstIncomplete >= 0) setCurrentStep(firstIncomplete)
  }, [])

  const totalSteps = ONBOARDING_STEPS.length
  const progressPct = ((currentStep + 1) / totalSteps) * 100
  const step = ONBOARDING_STEPS[currentStep]
  const StepIcon = STEP_ICONS[currentStep] || PartyPopper

  const completeStep = (stepId: string) => {
    const next = { ...state, completed: [...state.completed, stepId] }
    setState(next)
    saveOnboarding(next)
    if (currentStep < totalSteps - 1) setCurrentStep(currentStep + 1)
  }

  const skipStep = (stepId: string) => {
    const next = { ...state, skipped: [...state.skipped, stepId] }
    setState(next)
    saveOnboarding(next)
    if (currentStep < totalSteps - 1) setCurrentStep(currentStep + 1)
  }

  const handleInnSearch = async () => {
    if (!inn) return
    setInnLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setCompanyName("ООО «РОМАШКА»")
    setCity("Москва")
    setInnLoading(false)
    toast.success("Компания найдена")
  }

  const handleHhConnect = async () => {
    setHhConnecting(true)
    await new Promise(r => setTimeout(r, 1500))
    setHhConnected(true)
    setHhConnecting(false)
    toast.success("hh.ru подключён")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">H</div>
            <span className="text-lg font-bold text-foreground">HireFlow</span>
          </div>
          <Badge variant="outline" className="text-xs">Шаг {currentStep + 1} из {totalSteps}</Badge>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <Progress value={progressPct} className="h-2" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          {/* ═══ Шаг 1: Профиль компании ═══════════════════════ */}
          {currentStep === 0 && (
            <>
              <div className="text-center space-y-2">
                <Building2 className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Профиль компании</h1>
                <p className="text-muted-foreground">Расскажите о вашей компании</p>
              </div>
              <Card className="border-none shadow-lg">
                <CardContent className="pt-6 pb-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Название компании</Label>
                    <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">ИНН (автозаполнение)</Label>
                    <div className="flex gap-2">
                      <Input value={inn} onChange={e => setInn(e.target.value.replace(/\D/g, ""))} placeholder="7707083893" className="font-mono" />
                      <Button variant="outline" onClick={handleInnSearch} disabled={innLoading}>
                        {innLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Город</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Логотип</Label>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => toast.info("Загрузка (заглушка)")}>Загрузить</Button>
                    </div>
                  </div>
                  <Button className="w-full h-11" onClick={() => completeStep("company")}>
                    Продолжить <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ═══ Шаг 2: Первая вакансия ═══════════════════════ */}
          {currentStep === 1 && (
            <>
              <div className="text-center space-y-2">
                <Briefcase className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Первая вакансия</h1>
                <p className="text-muted-foreground">Создайте вакансию, чтобы начать принимать кандидатов</p>
              </div>
              <Card className="border-none shadow-lg">
                <CardContent className="pt-6 pb-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Название должности</Label>
                    <Input value={vacancyTitle} onChange={e => setVacancyTitle(e.target.value)} placeholder="Менеджер по продажам" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Город</Label>
                    <Input value={vacancyCity} onChange={e => setVacancyCity(e.target.value)} placeholder="Москва" />
                  </div>
                  <Button className="w-full h-11" onClick={() => { completeStep("vacancy"); toast.success("Вакансия создана!") }}>
                    Создать вакансию <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button variant="ghost" className="w-full text-muted-foreground gap-1.5" onClick={() => skipStep("vacancy")}>
                    <SkipForward className="w-4 h-4" /> Пропустить — сделаю позже
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ═══ Шаг 3: Подключить hh.ru ═════════════════════ */}
          {currentStep === 2 && (
            <>
              <div className="text-center space-y-2">
                <Link2 className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Подключить hh.ru</h1>
                <p className="text-muted-foreground">Автоматический импорт откликов</p>
              </div>
              <Card className="border-none shadow-lg">
                <CardContent className="pt-6 pb-6 space-y-4 text-center">
                  {!hhConnected ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-red-500 flex items-center justify-center text-white font-bold text-xl mx-auto">hh</div>
                      <p className="text-sm text-muted-foreground">Подключите аккаунт работодателя hh.ru для автоматического импорта откликов</p>
                      <Button className="w-full h-11 bg-red-500 hover:bg-red-600 text-white" onClick={handleHhConnect} disabled={hhConnecting}>
                        {hhConnecting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Подключение...</> : "Подключить hh.ru"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Check className="w-16 h-16 text-emerald-500 mx-auto" />
                      <p className="text-sm font-medium text-foreground">hh.ru подключён!</p>
                      <Button className="w-full h-11" onClick={() => completeStep("hh")}>
                        Продолжить <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </>
                  )}
                  {!hhConnected && (
                    <Button variant="ghost" className="w-full text-muted-foreground gap-1.5" onClick={() => skipStep("hh")}>
                      <SkipForward className="w-4 h-4" /> Пропустить
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ═══ Шаг 4: Демонстрация ═════════════════════════ */}
          {currentStep === 3 && (
            <>
              <div className="text-center space-y-2">
                <Play className="w-12 h-12 text-primary mx-auto" />
                <h1 className="text-2xl font-bold text-foreground">Создать демонстрацию</h1>
                <p className="text-muted-foreground">Выберите шаблон для первой демонстрации должности</p>
              </div>
              <Card className="border-none shadow-lg">
                <CardContent className="pt-6 pb-6 space-y-3">
                  {DEMO_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      className={cn(
                        "w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all",
                        selectedTemplate === t.id ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                      )}
                      onClick={() => setSelectedTemplate(t.id)}
                    >
                      <span className="text-2xl">{t.emoji}</span>
                      <span className="text-sm font-medium text-foreground">{t.title}</span>
                      {selectedTemplate === t.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                    </button>
                  ))}
                  <Button className="w-full h-11 mt-2" disabled={!selectedTemplate} onClick={() => { completeStep("demo"); toast.success("Шаблон выбран!") }}>
                    Создать демонстрацию <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button variant="ghost" className="w-full text-muted-foreground gap-1.5" onClick={() => skipStep("demo")}>
                    <SkipForward className="w-4 h-4" /> Пропустить
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ═══ Шаг 5: Готово ════════════════════════════════ */}
          {currentStep === 4 && (
            <>
              <div className="text-center space-y-4">
                <PartyPopper className="w-16 h-16 text-amber-500 mx-auto" />
                <h1 className="text-3xl font-bold text-foreground">Готово! 🎉</h1>
                <p className="text-lg text-muted-foreground">Платформа настроена. Начинайте нанимать!</p>
              </div>
              <div className="space-y-2">
                {ONBOARDING_STEPS.slice(0, -1).map(s => {
                  const isDone = state.completed.includes(s.id)
                  const isSkipped = state.skipped.includes(s.id)
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border">
                      {isDone ? <Check className="w-5 h-5 text-emerald-500" /> : isSkipped ? <SkipForward className="w-5 h-5 text-muted-foreground" /> : <div className="w-5 h-5" />}
                      <span className={cn("text-sm", isDone ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                      {isDone && <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200">Готово</Badge>}
                      {isSkipped && <Badge variant="outline" className="ml-auto text-[10px]">Пропущено</Badge>}
                    </div>
                  )
                })}
              </div>
              <Button size="lg" className="w-full h-14 text-base font-semibold" onClick={() => { completeStep("done"); router.push("/") }}>
                Перейти в кабинет <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
