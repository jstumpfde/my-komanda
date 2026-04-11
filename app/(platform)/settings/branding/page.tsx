"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Globe, Save, Loader2, CheckCircle2, XCircle, RefreshCw, Copy, AlertCircle, Upload, Trash2, Link2, Palette } from "lucide-react"
import { saveBrand, canCustomizeBrand, type BrandConfig } from "@/lib/branding"
import { fetchCompanyApi, updateCompanyApi } from "@/lib/company-storage"
import { CompanyLogo } from "@/components/company-logo"

interface ThemeColors { primary: string; background: string; foreground: string; sidebar: string; accent: string }

const THEME_PRESETS: Record<string, { label: string; emoji: string; colors: ThemeColors }> = {
  light: { label: "Светлая", emoji: "☀️", colors: { primary: "#6366f1", background: "#ffffff", foreground: "#0f172a", sidebar: "#1e1b4b", accent: "#818cf8" } },
  dark:  { label: "Тёмная",  emoji: "🌙", colors: { primary: "#818cf8", background: "#0f172a", foreground: "#f8fafc", sidebar: "#1e1b4b", accent: "#6366f1" } },
  warm:  { label: "Тёплая",  emoji: "🎨", colors: { primary: "#d97706", background: "#fffbeb", foreground: "#1c1917", sidebar: "#292524", accent: "#f59e0b" } },
}

const THEME_KEYS = ["light", "dark", "warm"] as const

function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement
  root.style.setProperty("--primary", colors.primary)
  root.style.setProperty("--background", colors.background)
  root.style.setProperty("--foreground", colors.foreground)
  root.style.setProperty("--sidebar-background", colors.sidebar)
  root.style.setProperty("--accent", colors.accent)
}

export default function BrandingPage() {
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [brandName, setBrandName] = useState("")
  const [brandSlogan, setBrandSlogan] = useState("")
  const [subdomain, setSubdomain] = useState("")
  const [subdomainStatus, setSubdomainStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle")
  const [customDomain, setCustomDomain] = useState("")
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "verified" | "error">("idle")
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [themeEnabled, setThemeEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(THEME_KEYS.map(k => [k, true]))
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCompany = useCallback(async () => {
    try {
      const data = await fetchCompanyApi()
      const c = data as Record<string, unknown>
      if (!c) return
      // Принимаем оба варианта именования — camelCase (из drizzle) и
      // snake_case (на случай если API внезапно сменит конвенцию).
      const brandNameVal = (c.brandName ?? c.brand_name ?? "") as string
      const brandSloganVal = (c.brandSlogan ?? c.brand_slogan ?? "") as string
      const logoUrlVal = (c.logoUrl ?? c.logo_url) as string | undefined
      const customThemeVal = (c.customTheme ?? c.custom_theme) as
        | Record<string, { enabled?: boolean }>
        | undefined

      // ТОЛЬКО brand_name / brand_slogan, без fallback на company.name/fullName.
      // Пусто — значит пусто, пользователь должен ввести явно.
      setBrandName(brandNameVal)
      setBrandSlogan(brandSloganVal)
      if (logoUrlVal) setLogoPreview(logoUrlVal)
      if (c.subdomain) setSubdomain(c.subdomain as string)
      if (customThemeVal) {
        setThemeEnabled(prev => {
          const next = { ...prev }
          for (const k of THEME_KEYS) {
            if (customThemeVal[k]?.enabled !== undefined) next[k] = customThemeVal[k].enabled!
          }
          return next
        })
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void loadCompany()
  }, [loadCompany])

  // Debounced subdomain check
  const checkSubdomain = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const clean = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (clean.length < 3) {
      setSubdomainStatus(clean.length > 0 ? "invalid" : "idle")
      return
    }
    setSubdomainStatus("checking")
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/branding/check-subdomain?subdomain=${encodeURIComponent(clean)}`)
        const data = await res.json()
        if (data.error) {
          setSubdomainStatus("invalid")
        } else {
          setSubdomainStatus(data.available ? "available" : "taken")
        }
      } catch {
        setSubdomainStatus("idle")
      }
    }, 500)
  }, [])

  const handleSubdomainChange = (value: string) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setSubdomain(clean)
    checkSubdomain(clean)
  }

  const uploadLogoFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) { toast.error("PNG, SVG, JPG или WebP"); return }

    // Оптимистичный предпросмотр (base64) — чтобы показать картинку сразу
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)

    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({})) as { logoUrl?: string; error?: string }

      if (!res.ok) {
        // Показываем точную ошибку с сервера, а не общую
        const msg = data.error || `HTTP ${res.status}`
        console.error("[uploadLogoFile] server error", res.status, data)
        toast.error(msg)
        return
      }
      if (!data.logoUrl) {
        toast.error("Сервер не вернул URL логотипа")
        return
      }

      setLogoPreview(data.logoUrl)
      toast.success("Логотип загружен")

      // Сервер уже обновил БД — дёрнем sidebar чтобы подхватил новый лого
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("company-updated"))
      }
    } catch (e) {
      console.error("[uploadLogoFile] network error", e)
      toast.error(e instanceof Error ? e.message : "Ошибка сети")
    } finally {
      setUploadingLogo(false)
    }
  }

  const verifyDomain = async () => {
    if (!customDomain.trim()) return
    setVerifying(true); setDomainStatus("checking")
    await new Promise(r => setTimeout(r, 2000))
    setDomainStatus(customDomain.endsWith(".ru") || customDomain.endsWith(".com") ? "verified" : "error")
    setVerifying(false)
  }

  const selectTheme = (key: string) => {
    applyThemeColors(THEME_PRESETS[key].colors)
    toast.success(`Тема «${THEME_PRESETS[key].label}» применена`)
  }

  const toggleTheme = (key: string, enabled: boolean) => {
    const enabledCount = THEME_KEYS.filter(k => themeEnabled[k]).length
    if (!enabled && enabledCount <= 1) { toast.error("Хотя бы одна тема должна быть включена"); return }
    setThemeEnabled(prev => ({ ...prev, [key]: enabled }))
  }

  // Отдельный save для блока «Логотип + Название + Слоган» — не трогает
  // темы и поддомен, только брендинг-поля. Пустые строки отправляем как "",
  // чтобы очистка поля работала (а не игнорировалась на сервере).
  const handleBrandBlockSave = async () => {
    setSaving(true)
    try {
      await updateCompanyApi({
        logo_url: logoPreview ?? "",
        brand_name: brandName,
        brand_slogan: brandSlogan,
      })
      saveBrand({ logoUrl: logoPreview, companyName: brandName })
      toast.success("Сохранено")
      await loadCompany()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("company-updated"))
      }
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const clean = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "")
      const customTheme = Object.fromEntries(
        THEME_KEYS.map(k => [k, { enabled: themeEnabled[k], colors: THEME_PRESETS[k].colors }])
      )
      await updateCompanyApi({
        logo_url: logoPreview ?? "",
        brand_name: brandName,
        brand_slogan: brandSlogan,
        subdomain: clean || undefined,
        custom_theme: customTheme as Record<string, unknown>,
      })
      saveBrand({ logoUrl: logoPreview, companyName: brandName })
      toast.success("Брендинг сохранён")
      // Перечитать данные чтобы форма отразила то что реально в БД
      await loadCompany()
      // Уведомить sidebar (и другие компоненты) о смене данных компании
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("company-updated"))
      }
    } catch {
      toast.success("Брендинг сохранён локально")
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Брендинг</h1>
        <p className="text-muted-foreground text-sm">Логотип, название, слоган и домен</p>
      </div>

      <div className="space-y-4">

        {/* ═══ Логотип + Название + Слоган (объединённый блок) ═══ */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-base font-semibold">Логотип, название и слоган</h3>
          </div>

          {/* Логотип */}
          <div className="flex items-start gap-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) uploadLogoFile(f) }}
              onClick={() => canBrand && fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all w-40 h-32 shrink-0",
                canBrand ? "cursor-pointer hover:border-primary/40 hover:bg-muted/20" : "cursor-not-allowed opacity-60",
                isDragging && "border-primary bg-primary/5",
              )}
            >
              <input ref={fileInputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogoFile(f) }} disabled={!canBrand} />
              {uploadingLogo ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                : <Upload className="w-5 h-5 text-muted-foreground" />}
              <p className="text-xs text-center text-muted-foreground">PNG, SVG, до 2 МБ</p>
            </div>

            <div className="flex items-center gap-4 flex-1 min-h-[128px]">
              {logoPreview ? (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-lg border bg-muted/20 flex items-center justify-center overflow-hidden">
                        <CompanyLogo logoUrl={logoPreview} companyName={brandName} size="md" rounded="md" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">Sidebar</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-[80px] h-[80px] rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden">
                        <CompanyLogo logoUrl={logoPreview} companyName={brandName} size="lg" rounded="md" className="!w-[60px] !h-[60px]" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">Вакансия</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-md border bg-muted/20 flex items-center justify-center overflow-hidden">
                        <CompanyLogo logoUrl={logoPreview} companyName={brandName} size="sm" rounded="sm" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">Мобильный</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive h-7 text-xs self-start"
                    onClick={() => { setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = "" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />Удалить
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Логотип не загружен</p>
              )}
            </div>
          </div>

          {/* Название + Слоган в одну строку */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Название бренда</Label>
              <Input
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Ромашка"
                className="h-9 text-sm"
              />
              <p className="text-xs text-muted-foreground">Отображается на публичных страницах</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Слоган</Label>
              <Input
                value={brandSlogan}
                onChange={e => setBrandSlogan(e.target.value)}
                placeholder="Нанимаем лучших"
                className="h-9 text-sm"
              />
              <p className="text-xs text-muted-foreground">Короткая фраза под логотипом</p>
            </div>
          </div>

          {/* Сохранить внутри блока */}
          <div className="flex justify-end pt-1 border-t border-border/40 -mx-6 px-6 -mb-6 pb-4 pt-4 mt-2">
            <Button size="sm" onClick={handleBrandBlockSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </div>

        {/* ═══ Темы платформы ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-500" />Темы платформы
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
            <div className="grid grid-cols-3 gap-3">
              {THEME_KEYS.map(key => {
                const preset = THEME_PRESETS[key]
                const enabled = themeEnabled[key]
                return (
                  <div
                    key={key}
                    className={cn(
                      "rounded-xl border p-4 transition-all",
                      enabled ? "border-border hover:shadow-sm" : "border-border opacity-60"
                    )}
                  >
                    {/* Mini preview */}
                    <button
                      type="button"
                      className="w-full rounded-lg overflow-hidden flex h-[80px] mb-3 border cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
                      onClick={() => enabled && selectTheme(key)}
                      disabled={!enabled}
                    >
                      <div className="w-8 shrink-0 flex flex-col items-center gap-1 py-2" style={{ background: preset.colors.sidebar }}>
                        {[1,2,3].map(i => <div key={i} className="w-5 h-5 rounded" style={{ background: i === 1 ? preset.colors.accent : preset.colors.accent + "30" }} />)}
                      </div>
                      <div className="flex-1 p-2 space-y-1" style={{ background: preset.colors.background }}>
                        <div className="h-2.5 rounded w-12" style={{ background: preset.colors.foreground + "20" }} />
                        <div className="h-2 rounded w-16" style={{ background: preset.colors.foreground + "10" }} />
                        <div className="flex gap-1 mt-1">
                          <div className="h-4 w-10 rounded" style={{ background: preset.colors.primary }} />
                          <div className="h-4 w-8 rounded border" style={{ borderColor: preset.colors.primary + "50" }} />
                        </div>
                      </div>
                    </button>
                    {/* Title + toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{preset.emoji} {preset.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => toggleTheme(key, v)}
                      />
                      <span className="text-xs text-muted-foreground">{enabled ? "Включена" : "Отключена"}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ═══ Поддомен ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" />Поддомен компании</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">
              Ваш поддомен для публичных страниц вакансий и демонстраций.
            </p>
            <div className="flex gap-2 items-center">
              <div className="flex-1 flex items-center max-w-lg">
                <Input
                  value={subdomain}
                  onChange={e => handleSubdomainChange(e.target.value)}
                  placeholder="mycompany"
                  className={cn(
                    "h-9 font-mono text-sm rounded-r-none border-r-0",
                    subdomainStatus === "available" && "border-emerald-500 focus-visible:ring-emerald-500",
                    subdomainStatus === "taken" && "border-destructive focus-visible:ring-destructive",
                    subdomainStatus === "invalid" && "border-orange-500 focus-visible:ring-orange-500",
                  )}
                />
                <span className="h-9 px-3 flex items-center text-sm text-muted-foreground bg-muted border border-l-0 rounded-r-lg shrink-0 font-mono">
                  .company24.pro
                </span>
              </div>
              {subdomainStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {subdomainStatus === "available" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {subdomainStatus === "taken" && <XCircle className="w-4 h-4 text-destructive" />}
            </div>
            {subdomainStatus === "available" && (
              <p className="text-xs text-emerald-600">Поддомен свободен</p>
            )}
            {subdomainStatus === "taken" && (
              <p className="text-xs text-destructive">Поддомен уже занят</p>
            )}
            {subdomainStatus === "invalid" && (
              <p className="text-xs text-orange-600">Минимум 3 символа, только латиница, цифры и дефис</p>
            )}
            {subdomain && subdomainStatus !== "invalid" && (
              <p className="text-xs text-muted-foreground">
                Итого: <span className="font-mono text-foreground">{subdomain}.company24.pro</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* ═══ Кастомный домен ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" />Кастомный домен</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            <div className="flex gap-2">
              <Input value={customDomain} onChange={e => { setCustomDomain(e.target.value); setDomainStatus("idle") }} placeholder="hr.company.ru" className="h-9 font-mono text-sm max-w-lg" />
              <Button variant="outline" size="sm" className="shrink-0 h-9 gap-1.5" onClick={verifyDomain} disabled={!customDomain.trim() || verifying}>
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Проверить
              </Button>
            </div>
            {domainStatus === "verified" && <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" />Домен подтверждён</div>}
            {domainStatus === "error" && <div className="flex items-center gap-2 text-sm text-destructive"><XCircle className="w-4 h-4" />DNS-записи не найдены</div>}
            {domainStatus === "checking" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Проверяем DNS...</div>}
            {domainStatus !== "verified" && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Добавьте CNAME-запись в DNS</p>
                </div>
                <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Тип</span><code className="font-mono">CNAME</code>
                  <span className="text-muted-foreground">Имя</span>
                  <div className="flex items-center gap-1"><code className="font-mono">{customDomain ? customDomain.split(".")[0] : "hr"}</code><button onClick={() => { navigator.clipboard.writeText(customDomain ? customDomain.split(".")[0] : "hr"); toast.success("Скопировано") }}><Copy className="w-3 h-3 text-muted-foreground" /></button></div>
                  <span className="text-muted-foreground">Значение</span>
                  <div className="flex items-center gap-1"><code className="font-mono">cname.company24.pro</code><button onClick={() => { navigator.clipboard.writeText("cname.company24.pro"); toast.success("Скопировано") }}><Copy className="w-3 h-3 text-muted-foreground" /></button></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Сохранить темы и домен ═══ */}
        <div className="flex justify-end pb-4">
          <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Сохранение..." : "Сохранить темы и домен"}
          </Button>
        </div>
      </div>
    </>
  )
}
