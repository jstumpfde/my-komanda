"use client"

import { useState, use, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  MapPin, Banknote, CheckCircle2, ArrowRight, Briefcase,
  Building2, Loader2,
} from "lucide-react"
import type { MiniFormField } from "@/components/vacancies/mini-form-builder"
import { FORMAT_LABELS, EMPLOYMENT_LABELS } from "@/lib/vacancy-types"

interface VacancyData {
  id: string
  title: string
  description: string | null
  city: string | null
  format: string | null
  employment: string | null
  salaryMin: number | null
  salaryMax: number | null
  companyName: string
  companyLogo: string | null
  brandPrimaryColor: string | null
  brandBgColor: string | null
  brandTextColor: string | null
  descriptionJson: Record<string, unknown> | null
}

type ScreenState = "loading" | "landing" | "form" | "done" | "error"

function VacancyPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const searchParams = useSearchParams()
  const utmSource = searchParams.get("utm_source") || searchParams.get("utm") || ""
  const utmMedium = searchParams.get("utm_medium") || ""
  const refId = searchParams.get("ref") || (typeof document !== "undefined" ? document.cookie.match(/utm_ref=([^;]+)/)?.[1] : "") || ""

  const [screen, setScreen] = useState<ScreenState>("loading")
  const [vacancy, setVacancy] = useState<VacancyData | null>(null)
  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [contactType, setContactType] = useState<"phone" | "telegram">("phone")
  const [submitting, setSubmitting] = useState(false)
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})

  const miniFormFields: MiniFormField[] =
    vacancy?.descriptionJson &&
    typeof vacancy.descriptionJson === "object" &&
    Array.isArray((vacancy.descriptionJson as Record<string, unknown>).miniFormFields)
      ? ((vacancy.descriptionJson as Record<string, unknown>).miniFormFields as MiniFormField[])
      : []

  useEffect(() => {
    fetch(`/api/public/vacancy/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found")
        return r.json()
      })
      .then((data: VacancyData) => {
        setVacancy(data)
        setScreen("landing")
      })
      .catch(() => setScreen("error"))
  }, [slug])

  // Track UTM click
  useEffect(() => {
    if (utmSource && screen === "landing") {
      fetch(`/api/public/vacancy/${slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utmSource, utmMedium }),
      }).catch(() => {})
    }
  }, [slug, utmSource, utmMedium, screen])

  const accentColor = vacancy?.brandPrimaryColor || "#3b82f6"
  const bgColor = vacancy?.brandBgColor || "#f0f4ff"
  const textColor = vacancy?.brandTextColor || "#1e293b"

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Введите имя")
      return
    }

    const missingRequired = miniFormFields.find(
      (f) => f.required && !extraFields[f.id]?.trim(),
    )
    if (missingRequired) {
      toast.error(`Заполните поле «${missingRequired.label}»`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/vacancy/${slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact: name, contactType: "phone", utmSource, refId, extraFields }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Ошибка отправки")
      }
      const data = await res.json()
      const token = data?.data?.token ?? data?.token
      if (token) {
        // Редирект на персональную демонстрацию
        window.location.href = `/demo/${token}`
        return
      }
      setScreen("done")
    } catch (err: any) {
      toast.error(err.message || "Не удалось отправить отклик")
    } finally {
      setSubmitting(false)
    }
  }

  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Вакансия не найдена</h1>
          <p className="text-muted-foreground">Возможно, вакансия была закрыта или ссылка устарела.</p>
        </div>
      </div>
    )
  }

  if (screen === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 mx-auto" style={{ color: accentColor }} />
          <h1 className="text-2xl font-bold text-foreground">Спасибо за отклик!</h1>
          <p className="text-muted-foreground">
            Мы получили вашу заявку и свяжемся с вами в ближайшее время.
          </p>
          <p className="text-xs text-muted-foreground/50">Powered by Company24</p>
        </div>
      </div>
    )
  }

  const v = vacancy!

  const formatSalary = (min: number | null, max: number | null) => {
    if (min && max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
    if (min) return `от ${min.toLocaleString("ru-RU")} ₽`
    if (max) return `до ${max.toLocaleString("ru-RU")} ₽`
    return null
  }

  const salary = formatSalary(v.salaryMin, v.salaryMax)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bgColor, color: textColor }}>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          {/* Компания */}
          <div className="flex justify-center">
            <div className="flex items-center gap-2">
              {v.companyLogo ? (
                <img src={v.companyLogo} alt={v.companyName} className="h-11 w-11 rounded-xl object-contain" />
              ) : (
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: accentColor }}
                >
                  {v.companyName[0]}
                </div>
              )}
              <span className="text-xl font-bold" style={{ color: textColor }}>{v.companyName}</span>
            </div>
          </div>

          {/* Заголовок */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{v.title}</h1>
            <div className="flex flex-wrap items-center justify-center gap-3 text-muted-foreground">
              {v.city && (
                <span className="flex items-center gap-1 text-sm">
                  <MapPin className="w-4 h-4" /> {v.city}
                </span>
              )}
              {salary && (
                <>
                  {v.city && <span className="text-border">·</span>}
                  <span className="flex items-center gap-1 text-sm">
                    <Banknote className="w-4 h-4" /> {salary}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Информация о вакансии */}
          <Card className="border-none">
            <CardContent className="pt-6 pb-6 space-y-4">
              {/* Формат и занятость */}
              <div className="flex flex-wrap gap-2">
                {v.format && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-muted">
                    <Building2 className="w-3.5 h-3.5" />
                    {FORMAT_LABELS[v.format] || v.format}
                  </span>
                )}
                {v.employment && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-muted">
                    <Briefcase className="w-3.5 h-3.5" />
                    {EMPLOYMENT_LABELS[v.employment] || v.employment}
                  </span>
                )}
              </div>

              {/* Описание */}
              {v.description && (
                <div
                  className="text-sm text-foreground/80 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: v.description }}
                />
              )}
            </CardContent>
          </Card>

          {/* CTA / Форма */}
          {screen === "landing" && (
            <Button
              size="lg"
              className="w-full h-14 text-base font-semibold text-white rounded-xl shadow-lg"
              style={{ backgroundColor: accentColor }}
              onClick={() => setScreen("form")}
            >
              Откликнуться
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          )}

          {screen === "form" && (
            <Card className="border-none">
              <CardContent className="pt-6 pb-6 space-y-4">
                {/* Системное: Имя */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Имя <span className="text-destructive">*</span></Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя Фамилия"
                    autoFocus
                  />
                </div>

                {/* Динамические поля из miniFormFields */}
                {miniFormFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>

                    {field.type === "text" && (
                      <Input
                        value={extraFields[field.id] || ""}
                        onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    )}

                    {field.type === "number" && (
                      <Input
                        type="number"
                        value={extraFields[field.id] || ""}
                        onChange={(e) => setExtraFields((prev) => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    )}

                    {field.type === "select" && field.options && (
                      <SelectPrimitive
                        value={extraFields[field.id] || ""}
                        onValueChange={(v) => setExtraFields((prev) => ({ ...prev, [field.id]: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </SelectPrimitive>
                    )}

                    {field.type === "boolean" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                          id={`extra-${field.id}`}
                          checked={extraFields[field.id] === "true"}
                          onCheckedChange={(checked) =>
                            setExtraFields((prev) => ({ ...prev, [field.id]: checked ? "true" : "false" }))
                          }
                        />
                        <Label htmlFor={`extra-${field.id}`} className="text-sm cursor-pointer">
                          Да
                        </Label>
                      </div>
                    )}
                  </div>
                ))}

                <Button
                  className="w-full h-12 text-white font-semibold"
                  style={{ backgroundColor: accentColor }}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Отправить отклик <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground/50">Powered by Company24</p>
        </div>
      </div>
    </div>
  )
}

export default function VacancyLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Загрузка...</div>}>
      <VacancyPageInner params={params} />
    </Suspense>
  )
}
