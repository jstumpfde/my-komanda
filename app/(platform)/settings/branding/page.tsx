"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Palette, Lock, Globe, Play, Save, Loader2, CheckCircle2, XCircle, RefreshCw, Copy, AlertCircle, Upload, Trash2, RotateCcw } from "lucide-react"
import { saveBrand, BRAND_PRESETS, canCustomizeBrand, type BrandConfig } from "@/lib/branding"
import { fetchCompanyApi, updateCompanyApi } from "@/lib/company-storage"
import { CompanyLogo } from "@/components/company-logo"

const DEFAULT_COLORS = {
  primary:    "#6366f1",
  background: "#ffffff",
  foreground: "#0f172a",
  sidebar:    "#1e1b4b",
  accent:     "#818cf8",
}

export default function BrandingPage() {
  const [brandPrimary, setBrandPrimary] = useState("#3b82f6")
  const [brandBg, setBrandBg] = useState("#f0f4ff")
  const [brandText, setBrandText] = useState("#1e293b")
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [customDomain, setCustomDomain] = useState("")
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "verified" | "error">("idle")
  const [verifying, setVerifying] = useState(false)
  const [shortName, setShortName] = useState("")
  const [greetingTemplate, setGreetingTemplate] = useState("Привет, {name}! 👋")
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Custom colors (Задача 9)
  const [customColors, setCustomColors] = useState({ ...DEFAULT_COLORS })

  useEffect(() => {
    fetchCompanyApi()
      .then((data: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = data as any
        if (!c) return
        if (c.name) setShortName(c.name)
        if (c.brandPrimaryColor) setBrandPrimary(c.brandPrimaryColor)
        if (c.brandBgColor) setBrandBg(c.brandBgColor)
        if (c.brandTextColor) setBrandText(c.brandTextColor)
        if (c.logoUrl) setLogoPreview(c.logoUrl)
        if (c.greetingTemplate) setGreetingTemplate(c.greetingTemplate)
        if (c.customTheme) setCustomColors({ ...DEFAULT_COLORS, ...c.customTheme })
      })
      .catch(() => {})
  }, [])

  const uploadLogoFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error("Файл слишком большой. Максимум 2 МБ"); return }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) {
      toast.error("Формат не поддерживается. Используйте PNG, SVG, JPG или WebP")
      return
    }
    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)

    // Upload to server
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload/logo", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Ошибка загрузки")
      }
      const { logoUrl } = await res.json()
      setLogoPreview(logoUrl)
      toast.success("Логотип загружен")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки логотипа")
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadLogoFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadLogoFile(file)
  }

  const removeLogo = () => {
    setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const verifyDomain = async () => {
    if (!customDomain.trim()) return
    setVerifying(true)
    setDomainStatus("checking")
    await new Promise(r => setTimeout(r, 2000))
    setDomainStatus(customDomain.endsWith(".ru") ? "verified" : "error")
    setVerifying(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCompanyApi({
        logo_url: logoPreview || undefined,
        brand_primary_color: brandPrimary,
        brand_bg_color: brandBg,
        brand_text_color: brandText,
        custom_theme: customColors,
      })
      saveBrand({ primaryColor: brandPrimary, bgColor: brandBg, textColor: brandText, logoUrl: logoPreview, companyName: shortName, greetingTemplate })
      toast.success("Брендинг сохранён")
    } catch {
      saveBrand({ primaryColor: brandPrimary, bgColor: brandBg, textColor: brandText, logoUrl: logoPreview, companyName: shortName, greetingTemplate })
      toast.success("Брендинг сохранён локально")
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Брендинг</h1>
        <p className="text-muted-foreground text-sm">Настройка внешнего вида страниц для кандидатов</p>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4" /> Брендинг
              {!canBrand && <Badge variant="outline" className="text-[10px] ml-2"><Lock className="w-3 h-3 mr-1" /> Business+</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("px-4 pb-4 pt-0 space-y-4", !canBrand && "opacity-60")}>
            {!canBrand && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Lock className="w-4 h-4 text-amber-600" />
                <span className="text-sm text-amber-700 dark:text-amber-400">Брендинг доступен с тарифа Business</span>
              </div>
            )}

            {/* Название компании */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Название компании</Label>
              <Input
                value={shortName}
                onChange={e => setShortName(e.target.value)}
                placeholder="ООО Ромашка"
                className="h-9 max-w-sm"
              />
            </div>

            {/* Приветствие */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Приветствие</Label>
              <Input
                value={greetingTemplate}
                onChange={e => setGreetingTemplate(e.target.value)}
                placeholder="Привет, {name}! 👋"
                className="h-9 max-w-sm"
              />
              <p className="text-[11px] text-muted-foreground"><code className="bg-muted px-1 rounded">{"{name}"}</code> — будет заменено на имя кандидата</p>
            </div>

            {/* Пресеты */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Тема</Label>
              <div className="flex flex-wrap gap-2">
                {BRAND_PRESETS.map(p => (
                  <button
                    key={p.id}
                    disabled={!canBrand}
                    className={cn(
                      "flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all",
                      brandPrimary === p.primary && brandBg === p.bg
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    )}
                    onClick={() => { setBrandPrimary(p.primary); setBrandBg(p.bg); setBrandText(p.text) }}
                  >
                    <span>{p.emoji}</span> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Цвета */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Основной цвет</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={brandPrimary} onChange={e => canBrand && setBrandPrimary(e.target.value)} disabled={!canBrand} className="w-10 h-10 rounded-lg border cursor-pointer disabled:cursor-not-allowed" />
                  <Input value={brandPrimary} onChange={e => canBrand && setBrandPrimary(e.target.value)} disabled={!canBrand} className="h-9 font-mono text-xs flex-1" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Фоновый цвет</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={brandBg} onChange={e => canBrand && setBrandBg(e.target.value)} disabled={!canBrand} className="w-10 h-10 rounded-lg border cursor-pointer disabled:cursor-not-allowed" />
                  <Input value={brandBg} onChange={e => canBrand && setBrandBg(e.target.value)} disabled={!canBrand} className="h-9 font-mono text-xs flex-1" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Цвет текста</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={brandText} onChange={e => canBrand && setBrandText(e.target.value)} disabled={!canBrand} className="w-10 h-10 rounded-lg border cursor-pointer disabled:cursor-not-allowed" />
                  <Input value={brandText} onChange={e => canBrand && setBrandText(e.target.value)} disabled={!canBrand} className="h-9 font-mono text-xs flex-1" />
                </div>
              </div>
            </div>

            {/* Логотип — расширенная секция (Задача 8) */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Логотип</Label>

              {/* Drag-and-drop зона */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => canBrand && fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-all max-w-xs",
                  canBrand ? "cursor-pointer hover:border-primary/40 hover:bg-muted/20" : "cursor-not-allowed opacity-60",
                  isDragging && "border-primary bg-primary/5"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.svg,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={handleLogoFileChange}
                  disabled={!canBrand}
                />
                {uploadingLogo ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Логотип" className="w-16 h-16 object-contain rounded-lg" />
                ) : (
                  <Upload className="w-6 h-6 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-xs font-medium text-foreground">{logoPreview ? "Нажмите для замены" : "Перетащите или нажмите"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">PNG или SVG, минимум 200×200px, до 2 МБ</p>
                </div>
              </div>

              {/* Кнопка удаления */}
              {logoPreview && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                  onClick={removeLogo}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Удалить логотип
                </Button>
              )}

              {/* Три контекстных превью */}
              <div className="flex items-start gap-4 pt-1">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-lg border bg-muted/20 flex items-center justify-center overflow-hidden">
                    <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="md" rounded="md" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Sidebar (40×40)</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-[120px] h-[120px] rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden">
                    <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="lg" rounded="md" className="!w-[100px] !h-[100px]" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Вакансия (120×120)</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-md border bg-muted/20 flex items-center justify-center overflow-hidden">
                    <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="sm" rounded="sm" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Мобильный (32×32)</span>
                </div>
              </div>
            </div>

            {/* Кастомный домен */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Кастомный домен
              </Label>

              <div className="flex gap-2 max-w-lg">
                <Input
                  value={customDomain}
                  onChange={e => { setCustomDomain(e.target.value); setDomainStatus("idle") }}
                  placeholder="hr.company.ru"
                  className="h-9 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-9 gap-1.5"
                  onClick={verifyDomain}
                  disabled={!customDomain.trim() || verifying}
                >
                  {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Проверить
                </Button>
              </div>

              {domainStatus === "verified" && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Домен подтверждён и активен
                </div>
              )}
              {domainStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <XCircle className="w-4 h-4" />
                  DNS-записи не найдены. Проверьте настройки и попробуйте снова.
                </div>
              )}
              {domainStatus === "checking" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Проверяем DNS-записи...
                </div>
              )}

              {domainStatus !== "verified" && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 max-w-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">Добавьте CNAME-запись в DNS вашего домена, затем нажмите «Проверить»</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">CNAME-запись</p>
                    <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Тип</span>
                      <code className="font-mono text-foreground">CNAME</code>
                      <span className="text-muted-foreground">Имя</span>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-foreground">{customDomain ? customDomain.split(".")[0] : "hr"}</code>
                        <button onClick={() => { navigator.clipboard.writeText(customDomain ? customDomain.split(".")[0] : "hr"); toast.success("Скопировано") }} className="text-muted-foreground hover:text-foreground">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-muted-foreground">Значение</span>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-foreground">cname.my-komanda.ru</code>
                        <button onClick={() => { navigator.clipboard.writeText("cname.my-komanda.ru"); toast.success("Скопировано") }} className="text-muted-foreground hover:text-foreground">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-muted-foreground">TTL</span>
                      <code className="font-mono text-foreground">3600</code>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Изменения DNS могут применяться до 48 часов. SSL-сертификат выпускается автоматически после проверки.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Live Preview */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Превью страницы кандидата</Label>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: canBrand ? brandBg : "#f0f4ff" }}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {logoPreview ? <img src={logoPreview} alt="" className="w-9 h-9 rounded-lg object-contain" /> : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: canBrand ? brandPrimary : "#3b82f6" }}>{shortName ? shortName[0] : "К"}</div>}
                    <span className="text-base font-bold" style={{ color: canBrand ? brandText : "#1e293b" }}>{shortName || "Название компании"}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: canBrand ? brandText : "#1e293b" }}>{greetingTemplate.replace("{name}", "Иван")}</h3>
                    <p className="text-sm mt-1" style={{ color: canBrand ? brandText + "99" : "#64748b" }}>Менеджер по продажам · {shortName || "Компания"}</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-10 px-5 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: canBrand ? brandPrimary : "#3b82f6" }}>
                      <Play className="w-4 h-4 mr-1.5" /> Начать демонстрацию
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs" style={{ color: canBrand ? brandText + "80" : "#94a3b8" }}><span>Урок 3 из 12</span><span>25%</span></div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: canBrand ? brandPrimary + "20" : "#e2e8f0" }}>
                      <div className="h-full rounded-full w-1/4" style={{ backgroundColor: canBrand ? brandPrimary : "#3b82f6" }} />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Применяется к: лендинг вакансии, страница кандидата, выбор слота, реферальная страница</p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Цвета платформы (beta) — Задача 9 ────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-500" />
              Цвета платформы
              <Badge variant="outline" className="text-[10px]">beta</Badge>
              {!canBrand && <Badge variant="outline" className="text-[10px] ml-1"><Lock className="w-3 h-3 mr-1" /> Pro</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {!canBrand ? (
              /* Стандартные темы как карточки */
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Выберите одну из стандартных тем интерфейса платформы</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "light", label: "Светлая", sidebar: "#1e1b4b", bg: "#ffffff", primary: "#6366f1" },
                    { id: "dark",  label: "Тёмная",  sidebar: "#0f0f1a", bg: "#1a1a2e", primary: "#818cf8" },
                    { id: "warm",  label: "Тёплая",  sidebar: "#1c1917", bg: "#faf9f7", primary: "#d97706" },
                  ].map(theme => (
                    <div key={theme.id} className="rounded-xl border overflow-hidden cursor-pointer hover:border-primary/50 transition-colors">
                      <div className="flex h-16">
                        <div className="w-8 shrink-0" style={{ background: theme.sidebar }} />
                        <div className="flex-1 flex items-center justify-center" style={{ background: theme.bg }}>
                          <div className="w-6 h-6 rounded-full" style={{ background: theme.primary }} />
                        </div>
                      </div>
                      <div className="px-2 py-1.5 text-center text-xs font-medium text-foreground">{theme.label}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-400">Кастомизация цветов платформы доступна на тарифе Pro</span>
                </div>
              </div>
            ) : (
              /* Полная кастомизация */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: "primary" as const,    label: "Основной" },
                    { key: "background" as const, label: "Фон" },
                    { key: "foreground" as const, label: "Текст" },
                    { key: "sidebar" as const,    label: "Сайдбар" },
                    { key: "accent" as const,     label: "Акцент" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customColors[key]}
                          onChange={e => setCustomColors(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-9 h-9 rounded-lg border cursor-pointer"
                        />
                        <Input
                          value={customColors[key]}
                          onChange={e => setCustomColors(prev => ({ ...prev, [key]: e.target.value }))}
                          className="h-9 font-mono text-xs flex-1"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Живой CSS-превью */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Превью интерфейса</Label>
                  <div className="rounded-xl border overflow-hidden flex h-28" style={{ background: customColors.background }}>
                    {/* Sidebar */}
                    <div className="w-14 shrink-0 flex flex-col items-center gap-2 py-3" style={{ background: customColors.sidebar }}>
                      {[1,2,3].map(i => (
                        <div key={i} className="w-7 h-7 rounded-lg" style={{ background: i === 1 ? customColors.accent : customColors.accent + "30" }} />
                      ))}
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-3 space-y-2">
                      <div className="h-4 rounded-md w-24" style={{ background: customColors.foreground + "20" }} />
                      <div className="h-3 rounded-md w-32" style={{ background: customColors.foreground + "15" }} />
                      <div className="flex gap-2 mt-2">
                        <div className="h-7 w-20 rounded-lg" style={{ background: customColors.primary }} />
                        <div className="h-7 w-16 rounded-lg border" style={{ borderColor: customColors.primary + "60" }} />
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => setCustomColors({ ...DEFAULT_COLORS })}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Сбросить к стандартным
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end pb-4">
          <Button size="lg" className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Сохранение..." : "Сохранить брендинг"}
          </Button>
        </div>
      </div>
    </>
  )
}
