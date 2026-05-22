"use client"

import { useState, use, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  MapPin, Banknote, CheckCircle2, ArrowRight, Briefcase,
  Building2, Loader2, Calendar,
} from "lucide-react"
import type { MiniFormField } from "@/components/vacancies/mini-form-builder"
import { FORMAT_LABELS, EMPLOYMENT_LABELS } from "@/lib/vacancy-types"
import { resolveBrand } from "@/lib/brand-colors"
import { formatDescription } from "@/lib/public-vacancy/format-description"

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
  const [submitting, setSubmitting] = useState(false)
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})

  const descriptionJson = vacancy?.descriptionJson && typeof vacancy.descriptionJson === "object"
    ? (vacancy.descriptionJson as Record<string, unknown>)
    : null

  const miniFormFields: MiniFormField[] = Array.isArray(descriptionJson?.miniFormFields)
    ? (descriptionJson!.miniFormFields as MiniFormField[])
    : []

  const companyDescriptionText = typeof descriptionJson?.companyDescription === "string"
    ? (descriptionJson!.companyDescription as string)
    : ""

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

  useEffect(() => {
    if (utmSource && screen === "landing") {
      fetch(`/api/public/vacancy/${slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utmSource, utmMedium }),
      }).catch(() => {})
    }
  }, [slug, utmSource, utmMedium, screen])

  const brand = vacancy ? resolveBrand(vacancy) : resolveBrand({})
  const accentColor = brand.primary
  const bgColor = brand.bg
  const textColor = brand.text

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
          <h1 className="text-2xl font-bold">Вакансия не найдена</h1>
          <p className="text-muted-foreground">Возможно, вакансия была закрыта или ссылка устарела.</p>
        </div>
      </div>
    )
  }

  if (screen === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor, color: textColor }}>
        <div className="max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 mx-auto" style={{ color: accentColor }} />
          <h1 className="text-2xl font-bold">Спасибо за отклик!</h1>
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
  const hasMeta = v.city || v.format || v.employment || salary

  // Описание: предпочитаем companyDescription (plain text из анкеты),
  // иначе fallback на description (HTML).
  const hasPlainDescription = companyDescriptionText.trim().length > 0
  const hasHtmlDescription = !hasPlainDescription && !!v.description?.trim()

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bgColor, color: textColor }}>
      {/* ── Шапка: логотип + название компании ───────────────────── */}
      <header className="border-b" style={{ borderColor: `${textColor}15` }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-5 flex items-center gap-3">
          {v.companyLogo ? (
            <img
              src={v.companyLogo}
              alt={v.companyName}
              className="h-11 w-11 rounded-xl object-contain bg-white/40"
            />
          ) : (
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: accentColor }}
            >
              {v.companyName[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate" style={{ color: textColor }}>
              {v.companyName}
            </div>
            <div className="text-xs opacity-60">Открытая вакансия</div>
          </div>
        </div>
      </header>

      {/* ── Контент ─────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
          {/* Заголовок + мета */}
          <section className="space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{v.title}</h1>
            {hasMeta && (
              <div className="flex flex-wrap gap-2">
                {v.city && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ backgroundColor: `${textColor}0d` }}
                  >
                    <MapPin className="w-3.5 h-3.5" /> {v.city}
                  </span>
                )}
                {v.format && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ backgroundColor: `${textColor}0d` }}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    {FORMAT_LABELS[v.format] || v.format}
                  </span>
                )}
                {v.employment && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ backgroundColor: `${textColor}0d` }}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    {EMPLOYMENT_LABELS[v.employment] || v.employment}
                  </span>
                )}
                {salary && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                  >
                    <Banknote className="w-3.5 h-3.5" /> {salary}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Описание */}
          {(hasPlainDescription || hasHtmlDescription) && (
            <section>
              <h2 className="text-xl font-semibold mb-4">О вакансии</h2>
              {hasPlainDescription ? (
                (() => {
                  const sections = formatDescription(companyDescriptionText)
                  if (sections.length === 0) {
                    return (
                      <p className="text-base leading-relaxed whitespace-pre-line">
                        {companyDescriptionText}
                      </p>
                    )
                  }
                  return (
                    <article className="space-y-6">
                      {sections.map((section, i) => (
                        <section key={i} className="space-y-3">
                          {section.title && (
                            <h3 className="text-xl sm:text-2xl font-semibold mt-6 mb-2">
                              {section.title}
                            </h3>
                          )}
                          {section.paragraphs.map((para, j) => (
                            <p
                              key={j}
                              className="text-base leading-relaxed whitespace-pre-line"
                              style={{ color: `${textColor}e6` }}
                            >
                              {para}
                            </p>
                          ))}
                        </section>
                      ))}
                    </article>
                  )
                })()
              ) : (
                <article
                  className="prose prose-base max-w-none prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3 prose-p:leading-relaxed prose-li:my-1"
                  dangerouslySetInnerHTML={{ __html: v.description! }}
                />
              )}
            </section>
          )}

          {/* ── CTA или форма ──────────────────────────────────── */}
          {screen === "landing" && (
            <section className="pt-2">
              <Button
                size="lg"
                className="w-full sm:w-auto h-14 px-8 text-base font-semibold text-white rounded-xl shadow-lg"
                style={{ backgroundColor: accentColor }}
                onClick={() => setScreen("form")}
              >
                Откликнуться
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="mt-3 text-sm opacity-60">
                Заполнение займёт меньше минуты
              </p>
            </section>
          )}

          {screen === "form" && (
            <section>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      Имя <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Имя Фамилия"
                      autoFocus
                    />
                  </div>

                  {miniFormFields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label className="text-sm font-medium">
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
                          onValueChange={(val) => setExtraFields((prev) => ({ ...prev, [field.id]: val }))}
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
            </section>
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        className="border-t py-6 text-center text-xs opacity-60"
        style={{ borderColor: `${textColor}15` }}
      >
        Powered by Company24.pro
      </footer>
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
