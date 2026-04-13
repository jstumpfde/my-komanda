"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowRight, ArrowLeft, Check, Upload, Building2, User, Puzzle, Image as ImageIcon, Rocket } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const STEPS = [
  { title: "Добро пожаловать!", icon: User },
  { title: "О компании", icon: Building2 },
  { title: "Модули", icon: Puzzle },
  { title: "Логотип", icon: ImageIcon },
  { title: "Готово!", icon: Rocket },
]

const MODULE_OPTIONS = [
  { id: "hr", label: "HR и найм", desc: "Вакансии, кандидаты, адаптация" },
  { id: "crm", label: "CRM / Продажи", desc: "Клиенты, сделки, воронка" },
  { id: "knowledge", label: "База знаний", desc: "Документы, регламенты, обучение" },
  { id: "marketing", label: "Маркетинг", desc: "Кампании, контент, аналитика" },
  { id: "booking", label: "Бронирование", desc: "Услуги, записи, расписание" },
  { id: "tasks", label: "Задачи", desc: "Проекты, канбан, дедлайны" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [inn, setInn] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [innLoading, setInnLoading] = useState(false)
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set(["hr"]))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (localStorage.getItem("mk_onboarding_completed") === "true") {
      router.replace("/overview")
    }
  }, [router])

  // DaData auto-fill
  const handleInnChange = async (val: string) => {
    setInn(val)
    if (val.replace(/\D/g, "").length === 10 || val.replace(/\D/g, "").length === 12) {
      setInnLoading(true)
      try {
        const res = await fetch(`/api/companies/by-inn?inn=${val.replace(/\D/g, "")}`)
        if (res.ok) {
          const data = (await res.json()) as { name?: string }
          if (data.name) { setCompanyName(data.name); toast.success("Данные заполнены автоматически") }
        }
      } catch {}
      finally { setInnLoading(false) }
    }
  }

  const finish = async () => {
    setSaving(true)
    try {
      // Save profile name if provided
      if (name.trim()) {
        await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        }).catch(() => {})
      }
      localStorage.setItem("mk_onboarding_completed", "true")
      router.push("/overview")
    } finally { setSaving(false) }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <Progress value={progress} className="flex-1 h-2" />
          <span className="text-xs text-muted-foreground font-medium">{step + 1}/{STEPS.length}</span>
        </div>

        <Card>
          <CardContent className="py-8 px-6">
            {/* Step 1: Welcome */}
            {step === 0 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Rocket className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Добро пожаловать в Company24!</h2>
                  <p className="text-sm text-muted-foreground mt-2">Настроим платформу за пару минут</p>
                </div>
                <div className="space-y-3 text-left">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Ваше имя</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" className="h-11" autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Ваша роль</Label>
                    <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Директор, HR-менеджер, ..." className="h-11" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Company */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-bold">Расскажите о компании</h2>
                  <p className="text-sm text-muted-foreground mt-1">Введите ИНН — остальное заполнится автоматически</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">ИНН</Label>
                    <div className="relative">
                      <Input value={inn} onChange={e => handleInnChange(e.target.value)} placeholder="7707083893" className="h-11" />
                      {innLoading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Название компании</Label>
                    <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="ООО Ромашка" className="h-11" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Modules */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-xl font-bold">Какие модули нужны?</h2>
                  <p className="text-sm text-muted-foreground mt-1">Можно изменить позже в настройках</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MODULE_OPTIONS.map(m => {
                    const active = selectedModules.has(m.id)
                    return (
                      <button key={m.id} type="button"
                        className={cn("text-left p-3 rounded-xl border-2 transition-all", active ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30")}
                        onClick={() => setSelectedModules(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                      >
                        <p className="text-sm font-medium">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Logo */}
            {step === 3 && (
              <div className="space-y-6 text-center">
                <h2 className="text-xl font-bold">Загрузите логотип</h2>
                <p className="text-sm text-muted-foreground">Будет отображаться в сайдбаре и публичных страницах</p>
                <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mx-auto cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPG до 2 МБ. Можно пропустить.</p>
              </div>
            )}

            {/* Step 5: Done */}
            {step === 4 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Готово!</h2>
                  <p className="text-sm text-muted-foreground mt-2">Платформа настроена. Создайте первую вакансию?</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button className="w-full h-11" onClick={finish} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                    Начать работу
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation */}
            {step < 4 && (
              <div className="flex items-center justify-between mt-8">
                <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : router.push("/overview")} className="gap-1">
                  {step === 0 ? "Пропустить" : <><ArrowLeft className="w-3.5 h-3.5" />Назад</>}
                </Button>
                <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1">
                  Далее<ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
