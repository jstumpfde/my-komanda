"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getBrand, type BrandConfig } from "@/lib/branding"
import {
  Copy, Check, ExternalLink, Eye, Code2, FileText,
  Globe, Smartphone, Monitor, ChevronRight, Plus, X, Save, Sparkles,
} from "lucide-react"

export interface MiniFormFieldForHtml {
  id: string
  label: string
  type: string
  required: boolean
  placeholder?: string
  options?: string[]
}

interface PublishTabProps {
  vacancyTitle: string
  vacancySlug: string
  vacancyCity?: string
  salaryFrom?: number
  salaryTo?: number
  brandOverride?: {
    companyName?: string
    color?: string
    logo?: string
    slogan?: string
  }
  formFields?: MiniFormFieldForHtml[]
  // Редактируемые буллеты-выгоды над формой (descriptionJson.landingBenefits).
  vacancyId?: string
  benefits?: string[]
  descriptionJson?: unknown
  onSaved?: () => void
}

interface BrandOverride {
  companyName?: string
  color?: string
  logo?: string
  slogan?: string
}

/** Экранирует спецсимволы HTML в пользовательских строках */
function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}

// Дефолтные буллеты-выгоды (если HR ничего не задал) — часть динамическая
// (доход×1.5 от нижней вилки, город). После ручного редактирования буллеты
// сохраняются как есть (literal) в descriptionJson.landingBenefits.
function defaultBenefits(v: { city?: string; salaryFrom?: number }): string[] {
  return [
    v.salaryFrom
      ? `Доход от ${Math.round(v.salaryFrom * 1.5).toLocaleString("ru-RU")} ₽ через 3 месяца`
      : "Доход выше среднего по рынку через 3 месяца",
    "Обучение и наставник с первого дня",
    "Карьерный рост до руководителя за 6-12 мес.",
    `Современный офис${v.city ? " в " + v.city : ""}`,
  ]
}

function generateFullPageHtml(
  brand: BrandConfig,
  vacancy: { title: string; slug: string; city?: string; salaryFrom?: number; salaryTo?: number },
  override?: BrandOverride,
  formFields?: MiniFormFieldForHtml[],
  benefits?: string[],
): string {
  const primary = override?.color || brand.primaryColor || "#3b82f6"
  const bg = override?.color ? override.color + "10" : brand.bgColor
  const text = brand.textColor
  const rawCompany = override?.companyName || brand.companyName || ""
  const company = rawCompany.trim() || "Ваша компания"
  const origin = typeof window !== "undefined" ? window.location.origin : "https://company24.pro"
  // B6: на внешнем сайте (Tilda/Wix) относительный путь /uploads/... ломается
  // (резолвится к чужому домену) → пустой квадрат. Делаем логотип абсолютным.
  const logoSrc = override?.logo || brand.logoUrl
  const logoUrl = logoSrc && logoSrc.startsWith("/") ? origin + logoSrc : logoSrc
  const initial = company.charAt(0) || "•"
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${company}" style="width:44px;height:44px;border-radius:12px;object-fit:contain" />`
    : `<div style="width:44px;height:44px;border-radius:12px;background:${primary};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">${initial}</div>`
  const salary = vacancy.salaryFrom && vacancy.salaryTo
    ? `${vacancy.salaryFrom.toLocaleString("ru-RU")} – ${vacancy.salaryTo.toLocaleString("ru-RU")} ₽`
    : ""
  const slogan = override?.slogan?.trim() || ""

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${vacancy.title} — ${company}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${bg};color:${text};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.container{max-width:480px;width:100%;text-align:center}
.logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px}
.logo-text{font-size:20px;font-weight:700;color:${text}}
h1{font-size:28px;font-weight:800;color:${text};margin-bottom:8px;line-height:1.2}
.slogan{color:${text}cc;font-size:15px;font-weight:500;margin-bottom:12px}
.meta{color:${text}99;font-size:14px;margin-bottom:24px}
.highlights{background:#fff;border-radius:16px;padding:24px;margin-bottom:24px;text-align:left}
.highlight{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;font-size:14px;color:${text}}
.highlight:last-child{margin-bottom:0}
.check{color:${primary};font-size:18px;flex-shrink:0;margin-top:1px}
.form-card{background:#fff;border-radius:16px;padding:24px;margin-bottom:24px}
.form-card input,.form-card select{width:100%;padding:12px 16px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:12px;outline:none;transition:border .2s;background:#fff;color:${text};appearance:none;-webkit-appearance:none}
.form-card input:focus,.form-card select:focus{border-color:${primary}}
.btn{display:block;width:100%;padding:16px;background:${primary};color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity .2s}
.btn:hover{opacity:.9}
.footer{font-size:11px;color:${text}40;margin-top:24px}
</style>
</head>
<body>
<div class="container">
<div class="logo">${logoHtml}<span class="logo-text">${company}</span></div>
<h1>${vacancy.title}</h1>
${slogan ? `<p class="slogan">${slogan}</p>\n` : ""}<p class="meta">${vacancy.city || ""}${salary ? " · " + salary : ""}</p>
<div class="highlights">
${(benefits && benefits.length > 0 ? benefits : defaultBenefits(vacancy))
  .map(b => b.trim())
  .filter(Boolean)
  .map(b => `<div class="highlight"><span class="check">✓</span>${escHtml(b)}</div>`)
  .join("\n")}
</div>
<div class="form-card">
<input type="text" id="hf-name" placeholder="Ваше имя" required />
<input type="tel" id="hf-phone" placeholder="Телефон" required />
${(formFields ?? []).map(f => {
  const lbl = escHtml(f.label)
  const ph = escHtml(f.placeholder || f.label)
  const fid = escHtml(f.id)
  const req = f.required ? " required" : ""
  if (f.type === "select" && f.options && f.options.length > 0) {
    const opts = f.options.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join("")
    return `<select id="hf-${fid}" data-field="${fid}"${req}><option value="" disabled selected>${lbl}</option>${opts}</select>`
  }
  const inputType = f.type === "number" ? "number" : "text"
  return `<input type="${inputType}" id="hf-${fid}" data-field="${fid}" placeholder="${ph}${f.required ? " *" : ""}"${req} />`
}).join("\n")}
<button class="btn" onclick="handleSubmit()">Узнать подробнее →</button>
</div>
<p class="footer">Powered by Company24</p>
</div>
<script>
function handleSubmit(){
var n=document.getElementById('hf-name').value;
var p=document.getElementById('hf-phone').value;
if(!n||!p){alert('Заполните имя и телефон');return}
var extra={};
document.querySelectorAll('[data-field]').forEach(function(el){
  var key=el.getAttribute('data-field');
  var val=el.value;
  if(el.hasAttribute('required')&&!val){alert('Заполните все обязательные поля');extra=null;return}
  if(extra!==null)extra[key]=val;
});
if(extra===null)return;
var qs='?name='+encodeURIComponent(n)+'&phone='+encodeURIComponent(p)+'&utm_source=embed';
if(Object.keys(extra).length>0)qs+='&extra='+encodeURIComponent(JSON.stringify(extra));
window.location.href='${origin}/vacancy/${vacancy.slug}'+qs;
}
</script>
</body>
</html>`
}

const CMS_INSTRUCTIONS: { id: string; name: string; steps: string[] }[] = [
  { id: "tilda", name: "Tilda", steps: [
    "Откройте редактор страницы в Tilda",
    "Добавьте блок «T123 — HTML код»",
    "Вставьте скопированный код в поле HTML",
    "Опубликуйте страницу",
  ]},
  { id: "wix", name: "Wix", steps: [
    "В редакторе Wix нажмите «+ Добавить»",
    "Выберите «Embed» → «Custom HTML»",
    "Вставьте код и нажмите «Применить»",
    "Настройте размер блока на всю ширину",
  ]},
  { id: "wordpress", name: "WordPress", steps: [
    "Создайте новую страницу или запись",
    "Добавьте блок «Произвольный HTML»",
    "Вставьте скопированный код",
    "Опубликуйте страницу",
  ]},
  { id: "other", name: "Другой сайт", steps: [
    "Скопируйте HTML-код",
    "Сохраните как .html файл или вставьте в HTML-редактор вашей CMS",
    "Загрузите на хостинг или вставьте на нужную страницу",
    "Убедитесь, что скрипт не заблокирован CSP политикой",
  ]},
]

export function PublishTab({ vacancyTitle, vacancySlug, vacancyCity, salaryFrom, salaryTo, brandOverride, formFields, vacancyId, benefits, descriptionJson, onSaved }: PublishTabProps) {
  const [brand, setBrand] = useState<BrandConfig | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeInstruction, setActiveInstruction] = useState<string | null>(null)

  // Редактируемые буллеты-выгоды. Если HR ещё ничего не сохранял —
  // подставляем дефолтные (динамические по зарплате/городу).
  const [benefitList, setBenefitList] = useState<string[]>(
    benefits && benefits.length > 0 ? benefits : defaultBenefits({ city: vacancyCity, salaryFrom }),
  )
  const [savingBenefits, setSavingBenefits] = useState(false)

  // Подхватываем буллеты при загрузке/смене вакансии (родитель догружает async).
  useEffect(() => {
    setBenefitList(
      benefits && benefits.length > 0 ? benefits : defaultBenefits({ city: vacancyCity, salaryFrom }),
    )
  }, [benefits, vacancyCity, salaryFrom])

  useEffect(() => {
    const base = { ...getBrand() }
    if (brandOverride) {
      if (brandOverride.companyName) base.companyName = brandOverride.companyName
      if (brandOverride.color) { base.primaryColor = brandOverride.color; base.bgColor = brandOverride.color + "10" }
      if (brandOverride.logo) base.logoUrl = brandOverride.logo
    }
    setBrand(base)
  }, [brandOverride])

  // Буллеты для генерации HTML — только непустые.
  const cleanBenefits = benefitList.map(b => b.trim()).filter(Boolean)

  const handleSaveBenefits = async () => {
    if (!vacancyId) return
    setSavingBenefits(true)
    try {
      const currentJson = descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null
        ? (descriptionJson as Record<string, unknown>)
        : {}
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...currentJson, landingBenefits: cleanBenefits } }),
      })
      if (!res.ok) throw new Error()
      toast.success("Выгоды сохранены")
      onSaved?.()
    } catch {
      toast.error("Не удалось сохранить выгоды")
    } finally {
      setSavingBenefits(false)
    }
  }

  const handleCopyCode = async () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBenefits)
    await navigator.clipboard.writeText(html)
    setCopied(true)
    toast.success("HTML-код скопирован в буфер обмена")
    setTimeout(() => setCopied(false), 3000)
  }

  const handlePreview = () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBenefits)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const handleDownload = () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBenefits)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vacancy-${vacancySlug}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("HTML-файл скачан")
  }

  if (!brand) return null

  return (
    <div className="space-y-6">
      {/* Редактор буллетов-выгод (показывается над формой на лендинге) */}
      {vacancyId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Выгоды над формой
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Список галочек-преимуществ, который кандидат видит над формой отклика
              на лендинге. Отредактируйте под свою вакансию.
            </p>
            <div className="space-y-2">
              {benefitList.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-primary" />
                  <Input
                    value={b}
                    onChange={(e) => setBenefitList(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder="Преимущество вакансии"
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setBenefitList(prev => prev.filter((_, j) => j !== i))}
                    title="Удалить"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setBenefitList(prev => [...prev, ""])}
              >
                <Plus className="w-3.5 h-3.5" /> Добавить выгоду
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleSaveBenefits}
                disabled={savingBenefits || cleanBenefits.length === 0}
              >
                <Save className="w-3.5 h-3.5" />
                {savingBenefits ? "Сохранение…" : "Сохранить выгоды"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Способ 4 — Полная страница */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              Полная страница (HTML)
            </CardTitle>
            <Badge variant="outline" className="text-xs">Способ 4</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Готовый HTML-файл со встроенными стилями. Работает в любом конструкторе сайтов — все цвета берутся из настроек брендинга автоматически.
          </p>

          {/* Действия */}
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" onClick={handleCopyCode}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Скопировано!" : "Скопировать полный код страницы"}
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={handlePreview}>
              <Eye className="w-4 h-4" />
              Предпросмотр
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={handleDownload}>
              <FileText className="w-4 h-4" />
              Скачать .html
            </Button>
          </div>

          {/* Мини-превью */}
          <div className="rounded-xl border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono flex-1 text-center truncate">
                {typeof window !== "undefined" ? window.location.origin : ""}/vacancy/{vacancySlug}
              </span>
            </div>
            <div
              className="p-6 flex items-center justify-center"
              style={{ backgroundColor: brand.bgColor, minHeight: 220 }}
            >
              <div className="text-center max-w-[280px] w-full space-y-3">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2">
                  {brand.logoUrl ? (
                    <img src={brand.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: brand.primaryColor }}>
                      {(brand.companyName.trim() || "Ваша компания").charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-bold" style={{ color: brand.textColor }}>{brand.companyName.trim() || "Ваша компания"}</span>
                </div>
                <h3 className="text-base font-bold" style={{ color: brand.textColor }}>{vacancyTitle}</h3>
                <p className="text-xs" style={{ color: brand.textColor + "80" }}>
                  {vacancyCity}{salaryFrom ? ` · ${salaryFrom.toLocaleString("ru-RU")} – ${salaryTo?.toLocaleString("ru-RU")} ₽` : ""}
                </p>
                {/* Bullets preview */}
                {cleanBenefits.length > 0 && (
                  <div className="bg-white rounded-lg p-3 text-left space-y-1">
                    {cleanBenefits.map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: brand.textColor }}>
                        <span className="shrink-0" style={{ color: brand.primaryColor }}>✓</span>
                        <span className="truncate">{b}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Mini form preview */}
                <div className="space-y-1.5 bg-white rounded-lg p-3">
                  <div className="h-7 rounded-md border bg-white" />
                  <div className="h-7 rounded-md border bg-white" />
                  {(formFields ?? []).map(f => (
                    <div key={f.id} className="h-7 rounded-md border bg-white relative overflow-hidden">
                      <span className="absolute inset-0 flex items-center px-2 text-[9px] text-gray-400 truncate">{f.label}{f.required ? " *" : ""}</span>
                    </div>
                  ))}
                  <div className="h-8 rounded-md text-white text-xs font-semibold flex items-center justify-center" style={{ backgroundColor: brand.primaryColor }}>
                    Узнать подробнее →
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Инструкции по CMS */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Как вставить на сайт:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CMS_INSTRUCTIONS.map(cms => (
                <button
                  key={cms.id}
                  className={cn(
                    "p-3 rounded-lg border text-center text-sm font-medium transition-all",
                    activeInstruction === cms.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 text-primary"
                      : "border-border hover:border-primary/30 text-foreground"
                  )}
                  onClick={() => setActiveInstruction(activeInstruction === cms.id ? null : cms.id)}
                >
                  {cms.name}
                </button>
              ))}
            </div>

            {activeInstruction && (
              <div className="mt-3 p-4 rounded-lg bg-muted/50 border space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {CMS_INSTRUCTIONS.find(c => c.id === activeInstruction)?.name}:
                </p>
                <ol className="space-y-1.5">
                  {CMS_INSTRUCTIONS.find(c => c.id === activeInstruction)?.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Что содержит код */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>Код содержит:</strong> полный лендинг вакансии, форму отклика, все стили встроены (не нужны внешние CSS), цвета из брендинга, после отклика → редирект на демонстрацию Company24.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
