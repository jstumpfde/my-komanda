"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getBrand, type BrandConfig } from "@/lib/branding"
import {
  Copy, Check, Eye, Code2, FileText,
  Plus, X, Save, Sparkles,
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
  // Редактируемые rich-текстовые блоки над формой (descriptionJson.landingBlocks).
  // Принимаем и новый формат ({ html }), и legacy ({ icon, text }).
  // benefits — legacy string[] (descriptionJson.landingBenefits) для обратной совместимости.
  vacancyId?: string
  blocks?: LandingBlockInput[]
  benefits?: string[]
  // Настройки кнопки формы (descriptionJson.landingButton).
  button?: LandingButton
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

// #47: rich-текстовый блок над формой лендинга. Иконки/эмодзи ставятся ВНУТРИ
// текста (inline). Хранится в descriptionJson.landingBlocks как { html }.
export interface LandingBlock { html: string }
// Legacy-совместимый вход: старые блоки { icon, text }.
export type LandingBlockInput = LandingBlock | { icon?: string; text?: string }

// #49: настройки кнопки формы (текст, цвет, иконка + её позиция).
// Хранится в descriptionJson.landingButton. Пустые поля → дефолты.
export interface LandingButton {
  text?: string
  color?: string
  icon?: string
  iconPosition?: "left" | "right"
}
// Набор эмодзи-иконок для кнопки (standalone HTML не может импортировать
// lucide, поэтому иконки — эмодзи, как и BLOCK_ICONS).
export const BUTTON_ICONS = ["→", "✓", "🚀", "📩", "💬", "👉", "✨", "🔥", "📞", "📝", "⭐", "❤️"]
export const DEFAULT_BUTTON_TEXT = "Узнать подробнее"
// Пресеты цвета кнопки (совпадают с палитрой navButton в notion-editor).
const BUTTON_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#8b5cf6", "#000000"]

function resolveButton(btn: LandingButton | undefined, fallbackColor: string): Required<LandingButton> {
  return {
    text: (btn?.text || "").trim() || DEFAULT_BUTTON_TEXT,
    color: btn?.color || fallbackColor,
    icon: btn?.icon ?? "→",
    iconPosition: btn?.iconPosition === "left" ? "left" : "right",
  }
}

// #48: очень лёгкая санитизация rich-HTML блоков для standalone-лендинга.
// Разрешаем только безопасные inline/blocks теги, вырезаем script/style/on*.
// (Контент вводит HR в своём же кабинете — это защита от случайной вставки.)
const ALLOWED_BLOCK_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "br", "p", "div", "span", "ul", "ol", "li", "a", "h3", "h4",
])
function sanitizeBlockHtml(html: string): string {
  if (!html) return ""
  let out = html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
  // Убираем неразрешённые теги (оставляя их содержимое).
  out = out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag: string, attrs: string) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_BLOCK_TAGS.has(t)) return ""
    if (t === "a") {
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1] || ""
      const safeHref = /^(https?:|mailto:|tel:)/i.test(href) ? href : ""
      return m.startsWith("</") ? "</a>" : `<a href="${escHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`
    }
    return m.startsWith("</") ? `</${t}>` : `<${t}>`
  })
  return out
}

// Текст «нет форматирования» → есть ли в html хоть какой-то видимый контент.
function htmlHasContent(html: string): boolean {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().length > 0
}

// Дефолтные блоки (если HR ничего не задал) — часть динамическая (доход×1.5 от
// нижней вилки, город). Возвращаем как rich-html (эмодзи inline).
function defaultBlocks(v: { city?: string; salaryFrom?: number }): LandingBlock[] {
  const lines = [
    v.salaryFrom
      ? `💰 Доход от ${Math.round(v.salaryFrom * 1.5).toLocaleString("ru-RU")} ₽ через 3 месяца`
      : "💰 Доход выше среднего по рынку через 3 месяца",
    "🎓 Обучение и наставник с первого дня",
    "📈 Карьерный рост до руководителя за 6-12 мес.",
    `📍 Современный офис${v.city ? " в " + v.city : ""}`,
  ]
  return [{ html: lines.map(l => `<div>${escHtml(l)}</div>`).join("") }]
}

// Нормализация одного блока входа в новый формат { html }.
function blockToHtml(b: LandingBlockInput): LandingBlock {
  if (b && typeof (b as LandingBlock).html === "string") return { html: (b as LandingBlock).html }
  const legacy = b as { icon?: string; text?: string }
  const icon = (legacy.icon || "").trim()
  const text = (legacy.text || "").trim()
  if (!text) return { html: "" }
  const inner = escHtml((icon ? icon + " " : "") + text).replace(/\n/g, "<br>")
  return { html: `<div>${inner}</div>` }
}

// Нормализация входа: новые landingBlocks ({html}|{icon,text}), либо legacy
// landingBenefits (string[]), либо дефолт.
function resolveBlocks(blocks: LandingBlockInput[] | undefined, benefits: string[] | undefined, v: { city?: string; salaryFrom?: number }): LandingBlock[] {
  if (blocks && blocks.length > 0) return blocks.map(blockToHtml)
  if (benefits && benefits.length > 0) return [{ html: benefits.map(t => `<div>${escHtml(t)}</div>`).join("") }]
  return defaultBlocks(v)
}

function generateFullPageHtml(
  brand: BrandConfig,
  vacancy: { title: string; slug: string; city?: string; salaryFrom?: number; salaryTo?: number },
  override?: BrandOverride,
  formFields?: MiniFormFieldForHtml[],
  blocks?: LandingBlock[],
  button?: LandingButton,
): string {
  const primary = override?.color || brand.primaryColor || "#3b82f6"
  const bg = override?.color ? override.color + "10" : brand.bgColor
  const text = brand.textColor
  const rawCompany = override?.companyName || brand.companyName || ""
  const company = rawCompany.trim() || "Ваша компания"
  const origin = typeof window !== "undefined" ? window.location.origin : "https://company24.pro"
  // #48 / B6: на внешнем сайте (Tilda/Wix) относительный путь /uploads/... ломается
  // (резолвится к чужому домену) → пустой квадрат. Делаем логотип абсолютным.
  const logoSrc = (override?.logo || brand.logoUrl || "").trim()
  const logoUrl = logoSrc && logoSrc.startsWith("/") ? origin + logoSrc : logoSrc
  const initial = company.charAt(0) || "•"
  // #48: fallback-аватар (буква на фоне primary) при пустом logoUrl. При битой
  // картинке onerror прячет <img> и показывает соседний fallback (не «сломанное
  // фото»). Оба элемента всегда в DOM — fallback скрыт, пока картинка грузится.
  const fallbackLogo = `<div style="width:44px;height:44px;border-radius:12px;background:${primary};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">${escHtml(initial)}</div>`
  const logoHtml = logoUrl
    ? `<img src="${escHtml(logoUrl)}" alt="${escHtml(company)}" style="width:44px;height:44px;border-radius:12px;object-fit:contain;background:#fff" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div style="display:none;width:44px;height:44px;border-radius:12px;background:${primary};align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">${escHtml(initial)}</div>`
    : fallbackLogo
  const salary = vacancy.salaryFrom && vacancy.salaryTo
    ? `${vacancy.salaryFrom.toLocaleString("ru-RU")} – ${vacancy.salaryTo.toLocaleString("ru-RU")} ₽`
    : ""
  const slogan = override?.slogan?.trim() || ""
  const btn = resolveButton(button, primary)
  const btnLabel = escHtml(btn.text)
  const btnIcon = btn.icon ? escHtml(btn.icon) : ""
  const btnInner = btn.iconPosition === "left"
    ? `${btnIcon ? btnIcon + " " : ""}${btnLabel}`
    : `${btnLabel}${btnIcon ? " " + btnIcon : ""}`

  const richBlocks = (blocks && blocks.length > 0 ? blocks : defaultBlocks(vacancy))
    .map(b => sanitizeBlockHtml(b.html || ""))
    .filter(h => htmlHasContent(h))

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(vacancy.title)} — ${escHtml(company)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${bg};color:${text};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.container{max-width:480px;width:100%}
/* #48: единая белая подложка — шапка, преимущества и форма в одной карточке */
.sheet{background:#fff;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.08);overflow:hidden;color:#0f172a}
.sheet-inner{padding:28px 24px}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.logo-text{font-size:18px;font-weight:700;color:#0f172a}
h1{font-size:26px;font-weight:800;color:#0f172a;margin-bottom:8px;line-height:1.2;text-align:center}
.slogan{color:#475569;font-size:15px;font-weight:500;margin-bottom:8px;text-align:center}
.meta{color:#64748b;font-size:14px;margin-bottom:20px;text-align:center}
.highlights{border-radius:16px;padding:20px;margin-bottom:20px;text-align:left;background:#f8fafc;border:1px solid #eef2f7}
.highlight-block{font-size:14px;line-height:1.55;color:#0f172a;margin-bottom:14px}
.highlight-block:last-child{margin-bottom:0}
.highlight-block a{color:${primary};text-decoration:underline}
.highlight-block ul,.highlight-block ol{padding-left:20px;margin:4px 0}
.form-card input,.form-card select{width:100%;padding:12px 16px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:12px;outline:none;transition:border .2s;background:#fff;color:#0f172a;appearance:none;-webkit-appearance:none}
.form-card input:focus,.form-card select:focus{border-color:${primary}}
.btn{display:block;width:100%;padding:16px;background:${btn.color};color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity .2s}
.btn:hover{opacity:.9}
.footer{font-size:11px;color:${text}66;margin-top:20px;text-align:center}
</style>
</head>
<body>
<div class="container">
<div class="sheet">
<div class="sheet-inner">
<div class="logo">${logoHtml}<span class="logo-text">${escHtml(company)}</span></div>
<h1>${escHtml(vacancy.title)}</h1>
${slogan ? `<p class="slogan">${escHtml(slogan)}</p>\n` : ""}<p class="meta">${escHtml(vacancy.city || "")}${salary ? " · " + salary : ""}</p>
${richBlocks.length > 0 ? `<div class="highlights">
${richBlocks.map(h => `<div class="highlight-block">${h}</div>`).join("\n")}
</div>` : ""}
<div class="form-card">
<input type="text" id="hf-name" placeholder="Ваше имя" required />
<input type="tel" id="hf-phone" placeholder="Телефон" required />
${(formFields ?? []).map(f => {
  const lbl = escHtml(f.label)
  // #46: плейсхолдер = label поля, а не example-value (f.placeholder — пример
  // «Москва» для «Город», кандидату он не нужен).
  const ph = lbl
  const fid = escHtml(f.id)
  const req = f.required ? " required" : ""
  if (f.type === "select" && f.options && f.options.length > 0) {
    const opts = f.options.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join("")
    return `<select id="hf-${fid}" data-field="${fid}"${req}><option value="" disabled selected>${lbl}</option>${opts}</select>`
  }
  const inputType = f.type === "number" ? "number" : "text"
  return `<input type="${inputType}" id="hf-${fid}" data-field="${fid}" placeholder="${ph}${f.required ? " *" : ""}"${req} />`
}).join("\n")}
<button class="btn" onclick="handleSubmit()">${btnInner}</button>
</div>
<p class="footer">Powered by Company24</p>
</div>
</div>
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

// #47: лёгкий rich-редактор одного блока (contentEditable + мини-тулбар).
// Эмодзи вводятся прямо в тексте. Хранит и отдаёт HTML (санитизуется при сохранении).
function RichBlockEditor({ value, onChange, placeholder }: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInternal = useRef(false)

  // Синхроним value → DOM только при внешних изменениях (не при своём вводе).
  useEffect(() => {
    if (ref.current && !isInternal.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || ""
    }
    isInternal.current = false
  }, [value])

  const sync = () => {
    if (!ref.current) return
    isInternal.current = true
    onChange(ref.current.innerHTML)
  }
  const exec = (cmd: string) => {
    document.execCommand(cmd, false)
    ref.current?.focus()
    sync()
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30">
        <button type="button" title="Жирный" onMouseDown={(e) => { e.preventDefault(); exec("bold") }} className="px-2 py-1 rounded hover:bg-muted text-sm font-bold">B</button>
        <button type="button" title="Курсив" onMouseDown={(e) => { e.preventDefault(); exec("italic") }} className="px-2 py-1 rounded hover:bg-muted text-sm italic">I</button>
        <button type="button" title="Список" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList") }} className="px-2 py-1 rounded hover:bg-muted text-xs">• Список</button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        data-placeholder={placeholder || "Текст блока…"}
        className={cn(
          "px-3 py-2.5 min-h-[52px] outline-none text-sm leading-relaxed",
          "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground/50 [&:empty]:before:pointer-events-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:underline",
        )}
      />
    </div>
  )
}

export function PublishTab({ vacancyTitle, vacancySlug, vacancyCity, salaryFrom, salaryTo, brandOverride, formFields, vacancyId, blocks, benefits, button, descriptionJson, onSaved }: PublishTabProps) {
  const [brand, setBrand] = useState<BrandConfig | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeInstruction, setActiveInstruction] = useState<string | null>(null)

  // #47: rich-текстовые блоки над формой. Если HR ещё ничего не сохранял —
  // дефолтные (динамические по зарплате/городу). Поддерживаем legacy landingBenefits.
  const [blockList, setBlockList] = useState<LandingBlock[]>(
    resolveBlocks(blocks, benefits, { city: vacancyCity, salaryFrom }),
  )
  // #49: настройки кнопки формы.
  const [btnCfg, setBtnCfg] = useState<LandingButton>(button ?? {})
  const [savingBlocks, setSavingBlocks] = useState(false)
  // S3: авто-сохранение блоков. isUserEditRef отличает правки пользователя от
  // синка из props (иначе синк триггерил бы лишний автосейв). autoSaved — бейдж.
  const [autoSaved, setAutoSaved] = useState(false)
  const isUserEditRef = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Подхватываем блоки/кнопку при загрузке/смене вакансии (родитель догружает async).
  // Это НЕ правка пользователя → сбрасываем флаг, чтобы автосейв не сработал.
  useEffect(() => {
    isUserEditRef.current = false
    setBlockList(resolveBlocks(blocks, benefits, { city: vacancyCity, salaryFrom }))
    setBtnCfg(button ?? {})
  }, [blocks, benefits, button, vacancyCity, salaryFrom])

  // Правка пользователя: помечаем флаг, дальше сработает автосейв (debounce).
  const editBlocks = (updater: (prev: LandingBlock[]) => LandingBlock[]) => {
    isUserEditRef.current = true
    setAutoSaved(false)
    setBlockList(updater)
  }
  const editButton = (patch: Partial<LandingButton>) => {
    isUserEditRef.current = true
    setAutoSaved(false)
    setBtnCfg(prev => ({ ...prev, ...patch }))
  }

  useEffect(() => {
    const base = { ...getBrand() }
    if (brandOverride) {
      if (brandOverride.companyName) base.companyName = brandOverride.companyName
      if (brandOverride.color) { base.primaryColor = brandOverride.color; base.bgColor = brandOverride.color + "10" }
      if (brandOverride.logo) base.logoUrl = brandOverride.logo
    }
    setBrand(base)
  }, [brandOverride])

  // Блоки для генерации HTML — только с непустым (после санитизации) контентом.
  const cleanBlocks: LandingBlock[] = blockList
    .map(b => ({ html: sanitizeBlockHtml(b.html || "") }))
    .filter(b => htmlHasContent(b.html))

  // Тело запроса на сохранение: блоки + кнопка (в общий description_json).
  // Точечный payload — сервер root-мёржит (mergeDescriptionJson); не шлём весь
  // снапшот, иначе устаревшие независимые секции затирались бы (баг «слетает»).
  const buildSaveBody = (clean: LandingBlock[], btn: LandingButton) => {
    return { description_json: { landingBlocks: clean, landingBenefits: [], landingButton: btn } }
  }

  const handleSaveBlocks = async () => {
    if (!vacancyId) return
    setSavingBlocks(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSaveBody(cleanBlocks, btnCfg)),
      })
      if (!res.ok) throw new Error()
      toast.success("Блоки сохранены")
      onSaved?.()
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingBlocks(false)
    }
  }

  // S3: тихое авто-сохранение (без toast и БЕЗ onSaved — иначе refetch
  // родителя перезатёр бы текст во время набора). Дёргается debounce-эффектом.
  const autoSaveBlocks = useCallback(async () => {
    if (!vacancyId) return
    const clean = blockList.map(b => ({ html: sanitizeBlockHtml(b.html || "") })).filter(b => htmlHasContent(b.html))
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Точечный payload — сервер root-мёржит (mergeDescriptionJson).
        body: JSON.stringify({ description_json: { landingBlocks: clean, landingBenefits: [], landingButton: btnCfg } }),
      })
      if (!res.ok) throw new Error()
      setAutoSaved(true)
    } catch { /* молча — остаётся ручная кнопка «Сохранить» */ }
  }, [vacancyId, blockList, btnCfg, descriptionJson])

  useEffect(() => {
    if (!isUserEditRef.current || !vacancyId) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { autoSaveBlocks() }, 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [blockList, btnCfg, vacancyId, autoSaveBlocks])

  const handleCopyCode = async () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBlocks, btnCfg)
    await navigator.clipboard.writeText(html)
    setCopied(true)
    toast.success("HTML-код скопирован в буфер обмена")
    setTimeout(() => setCopied(false), 3000)
  }

  const handlePreview = () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBlocks, btnCfg)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const handleDownload = () => {
    if (!brand) return
    const html = generateFullPageHtml(brand, { title: vacancyTitle, slug: vacancySlug, city: vacancyCity, salaryFrom, salaryTo }, brandOverride, formFields, cleanBlocks, btnCfg)
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

  const resolvedBtn = resolveButton(btnCfg, brand.primaryColor)

  return (
    <div className="space-y-6">
      {/* Редактор текстовых блоков (показываются над формой на лендинге) */}
      {vacancyId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Текст над формой
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Текстовые блоки, которые кандидат видит над формой отклика на лендинге.
              Форматируйте текст, добавляйте эмодзи прямо внутри блока. Можно
              несколько блоков — для разделения на смысловые части.
            </p>
            <div className="space-y-3">
              {blockList.map((b, i) => (
                <div key={i} className="relative">
                  <RichBlockEditor
                    value={b.html}
                    onChange={(html) => editBlocks(prev => prev.map((x, j) => j === i ? { html } : x))}
                    placeholder="Текст блока — например: 💰 Доход от 150 000 ₽…"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-background border shadow-sm text-muted-foreground hover:text-destructive"
                    onClick={() => editBlocks(prev => prev.filter((_, j) => j !== i))}
                    title="Удалить блок"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => editBlocks(prev => [...prev, { html: "" }])}
            >
              <Plus className="w-3.5 h-3.5" /> Добавить блок
            </Button>

            <Separator />

            {/* #49: настройки кнопки формы */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Кнопка формы</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Надпись</Label>
                  <Input
                    value={btnCfg.text ?? ""}
                    onChange={(e) => editButton({ text: e.target.value })}
                    placeholder={DEFAULT_BUTTON_TEXT}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Цвет</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={resolvedBtn.color}
                      onChange={(e) => editButton({ color: e.target.value })}
                      className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-0.5"
                      title="Цвет кнопки"
                    />
                    <div className="flex gap-1">
                      {BUTTON_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={cn(
                            "h-7 w-7 rounded-md border transition-transform hover:scale-110",
                            resolvedBtn.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-offset-1 ring-primary",
                          )}
                          style={{ backgroundColor: c }}
                          onClick={() => editButton({ color: c })}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Иконка</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="h-9 w-12 p-0 text-lg leading-none">
                        {resolvedBtn.icon || "—"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="grid grid-cols-6 gap-1">
                        <button
                          type="button"
                          className={cn(
                            "h-8 w-8 rounded-md text-xs leading-none hover:bg-muted transition-colors flex items-center justify-center",
                            !btnCfg.icon && "bg-primary/10 ring-1 ring-primary",
                          )}
                          onClick={() => editButton({ icon: "" })}
                          title="Без иконки"
                        >
                          —
                        </button>
                        {BUTTON_ICONS.map(ic => (
                          <button
                            key={ic}
                            type="button"
                            className={cn(
                              "h-8 w-8 rounded-md text-lg leading-none hover:bg-muted transition-colors",
                              resolvedBtn.icon === ic && "bg-primary/10 ring-1 ring-primary",
                            )}
                            onClick={() => editButton({ icon: ic })}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Позиция иконки</Label>
                  <div className="flex gap-1 p-0.5 bg-muted rounded-lg w-fit">
                    {(["left", "right"] as const).map(pos => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => editButton({ iconPosition: pos })}
                        className={cn(
                          "px-3 h-8 text-xs rounded-md transition-colors",
                          resolvedBtn.iconPosition === pos ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {pos === "left" ? "Слева" : "Справа"}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Живой предпросмотр кнопки */}
                <div className="ml-auto">
                  <div
                    className="h-9 px-5 rounded-lg text-white text-sm font-semibold flex items-center gap-1.5"
                    style={{ backgroundColor: resolvedBtn.color }}
                  >
                    {resolvedBtn.iconPosition === "left" && resolvedBtn.icon && <span>{resolvedBtn.icon}</span>}
                    <span>{resolvedBtn.text}</span>
                    {resolvedBtn.iconPosition === "right" && resolvedBtn.icon && <span>{resolvedBtn.icon}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {autoSaved && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600"><Check className="w-3 h-3" /> Сохранено автоматически</span>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleSaveBlocks}
                disabled={savingBlocks}
              >
                <Save className="w-3.5 h-3.5" />
                {savingBlocks ? "Сохранение…" : "Сохранить"}
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
              {/* #48: единая белая подложка — шапка + блоки + форма в одной карточке */}
              <div className="max-w-[300px] w-full bg-white rounded-2xl shadow-md p-4 space-y-3 text-slate-900">
                {/* Logo (шапка теперь внутри белой карточки) */}
                <div className="flex items-center gap-2">
                  {brand.logoUrl ? (
                    <img src={brand.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain bg-white" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: brand.primaryColor }}>
                      {(brand.companyName.trim() || "Ваша компания").charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-bold truncate">{brand.companyName.trim() || "Ваша компания"}</span>
                </div>
                <h3 className="text-base font-bold text-center">{vacancyTitle}</h3>
                <p className="text-xs text-center text-slate-500">
                  {vacancyCity}{salaryFrom ? ` · ${salaryFrom.toLocaleString("ru-RU")} – ${salaryTo?.toLocaleString("ru-RU")} ₽` : ""}
                </p>
                {/* Blocks preview (rich html) */}
                {cleanBlocks.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-left space-y-1.5">
                    {cleanBlocks.map((b, i) => (
                      <div
                        key={i}
                        className="text-[11px] leading-snug text-slate-700 [&_ul]:list-disc [&_ul]:pl-4 [&_a]:text-blue-600 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: sanitizeBlockHtml(b.html) }}
                      />
                    ))}
                  </div>
                )}
                {/* Mini form preview */}
                <div className="space-y-1.5">
                  <div className="h-7 rounded-md border bg-white" />
                  <div className="h-7 rounded-md border bg-white" />
                  {(formFields ?? []).map(f => (
                    <div key={f.id} className="h-7 rounded-md border bg-white relative overflow-hidden">
                      <span className="absolute inset-0 flex items-center px-2 text-[9px] text-gray-400 truncate">{f.label}{f.required ? " *" : ""}</span>
                    </div>
                  ))}
                  <div className="h-8 rounded-md text-white text-xs font-semibold flex items-center justify-center gap-1.5" style={{ backgroundColor: resolvedBtn.color }}>
                    {resolvedBtn.iconPosition === "left" && resolvedBtn.icon && <span>{resolvedBtn.icon}</span>}
                    <span>{resolvedBtn.text}</span>
                    {resolvedBtn.iconPosition === "right" && resolvedBtn.icon && <span>{resolvedBtn.icon}</span>}
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
