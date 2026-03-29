"use client"

import { useState, use, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Play, MapPin, Banknote, CheckCircle2, ArrowRight, ChevronRight,
  Briefcase, TrendingUp, Users, Clock,
} from "lucide-react"
import { getBrand, brandCssVars, type BrandConfig } from "@/lib/branding"

// Мок-вакансия
const VACANCY = {
  slug: "manager",
  title: "Менеджер по продажам",
  company: "ООО Ромашка",
  city: "Москва",
  salaryFrom: 80000,
  salaryTo: 150000,
  highlights: [
    "Доход от 120 000 ₽ через 3 месяца",
    "Обучение и наставник с первого дня",
    "Карьерный рост до руководителя за 6-12 мес.",
    "Современный офис в центре Москвы",
  ],
  brandColor: "#1B4FD8",
  logo: null as string | null,
}

type ScreenState = "landing" | "form" | "done"

function VacancyLandingInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const searchParams = useSearchParams()
  const utm = searchParams.get("utm_source") || searchParams.get("utm") || ""

  const [screen, setScreen] = useState<ScreenState>("landing")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [brand, setBrand] = useState<BrandConfig | null>(null)

  useEffect(() => { setBrand(getBrand()) }, [])

  // Определяем способ входа по UTM
  const isHh = utm === "hh"
  const isAvito = utm === "avito"
  const showOAuth = isHh || isAvito
  const showForm = !showOAuth // tg, vk, site, qr, empty

  const v = VACANCY
  const accentColor = brand?.primaryColor || v.brandColor
  const bgColor = brand?.bgColor || "#f0f4ff"
  const textColor = brand?.textColor || "#1e293b"
  const logoUrl = brand?.logoUrl
  const companyDisplay = brand?.companyName || v.company

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Заполните имя и телефон")
      return
    }
    setScreen("done")
    toast.success("Отклик отправлен!")
  }

  const handleOAuth = (provider: string) => {
    toast.success(`Вход через ${provider} (заглушка)`)
    setScreen("done")
  }

  if (screen === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 mx-auto" style={{ color: accentColor }} />
          <h1 className="text-2xl font-bold text-foreground">Отлично! Мы получили ваш отклик</h1>
          <p className="text-muted-foreground">
            Сейчас мы перенаправим вас на короткую демонстрацию должности — узнаете о компании, роли и доходе.
          </p>
          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold text-white rounded-xl"
            style={{ backgroundColor: accentColor }}
            onClick={() => toast.info("Переход к демонстрации (заглушка)")}
          >
            <Play className="w-5 h-5 mr-2" />
            Начать демонстрацию
          </Button>
          <p className="text-xs text-muted-foreground/50">Powered by Моя Команда</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bgColor, color: textColor, ...brand ? brandCssVars(brand) : {} }}>
      {/* Landing */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-8">
          {/* Логотип */}
          <div className="flex justify-center">
            {logoUrl ? (
              <div className="flex items-center gap-2">
                <img src={logoUrl} alt={companyDisplay} className="h-11 w-11 rounded-xl object-contain" />
                <span className="text-xl font-bold" style={{ color: textColor }}>{companyDisplay}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: accentColor }}>
                  {companyDisplay[0]}
                </div>
                <span className="text-xl font-bold" style={{ color: textColor }}>{companyDisplay}</span>
              </div>
            )}
          </div>

          {/* Заголовок */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{v.title}</h1>
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1 text-sm">
                <MapPin className="w-4 h-4" /> {v.city}
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1 text-sm">
                <Banknote className="w-4 h-4" /> {v.salaryFrom.toLocaleString("ru-RU")} – {v.salaryTo.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </div>

          {/* Хайлайты */}
          <Card className="border-none shadow-lg">
            <CardContent className="pt-6 pb-6 space-y-3">
              {v.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: accentColor }} />
                  <span className="text-foreground text-sm">{h}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {screen === "landing" && (
            <div className="space-y-4">
              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold text-white rounded-xl shadow-lg"
                style={{ backgroundColor: accentColor }}
                onClick={() => setScreen("form")}
              >
                <Play className="w-5 h-5 mr-2" />
                Узнать подробнее и откликнуться
              </Button>
              <p className="text-center">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                  onClick={() => {
                    if (isHh) handleOAuth("hh.ru")
                    else if (isAvito) handleOAuth("Авито")
                    else setScreen("form")
                  }}
                >
                  Уже откликались на hh? Войти
                </button>
              </p>
            </div>
          )}

          {screen === "form" && (
            <Card className="border-none shadow-lg">
              <CardContent className="pt-6 pb-6 space-y-4">
                {showOAuth ? (
                  <>
                    {isHh && (
                      <Button
                        className="w-full h-12 bg-red-500 hover:bg-red-600 text-white gap-2"
                        onClick={() => handleOAuth("hh.ru")}
                      >
                        🔴 Войти через hh.ru
                      </Button>
                    )}
                    {isAvito && (
                      <Button
                        className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
                        onClick={() => handleOAuth("Авито")}
                      >
                        🟢 Войти через Авито
                      </Button>
                    )}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">или</span></div>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Имя</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас зовут?" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Телефон</Label>
                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" />
                      </div>
                      <Button
                        className="w-full h-12 text-white font-semibold"
                        style={{ backgroundColor: accentColor }}
                        onClick={handleSubmit}
                      >
                        Начать демонстрацию <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Имя</Label>
                      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас зовут?" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Телефон</Label>
                      <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" />
                    </div>
                    <Button
                      className="w-full h-12 text-white font-semibold"
                      style={{ backgroundColor: accentColor }}
                      onClick={handleSubmit}
                    >
                      Начать демонстрацию <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground/50">Powered by Моя Команда</p>
        </div>
      </div>
    </div>
  )
}

export default function VacancyLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Загрузка...</div>}>
      <VacancyLandingInner params={params} />
    </Suspense>
  )
}
