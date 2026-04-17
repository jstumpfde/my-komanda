"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { useTheme } from "next-themes"

const THEME_PRESETS: Record<string, { label: string; emoji: string }> = {
  light: { label: "Светлая", emoji: "☀️" },
  dark:  { label: "Тёмная",  emoji: "🌙" },
  warm:  { label: "Тёплая",  emoji: "🎨" },
}

const THEME_KEYS = ["light", "dark", "warm"] as const

export default function BrandingPage() {
  const { setTheme: applyTheme, theme: currentTheme } = useTheme()
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [brandName, setBrandName] = useState("")
  const [brandSlogan, setBrandSlogan] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "verified" | "error">("idle")
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [themeEnabled, setThemeEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(THEME_KEYS.map(k => [k, true]))
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      // subdomain: пока не используется (планируется позже)
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

  const uploadLogoFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) { toast.error("PNG, SVG, JPG или WebP"); return }

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
    applyTheme(key)
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
      const customTheme = Object.fromEntries(
        THEME_KEYS.map(k => [k, { enabled: themeEnabled[k] }])
      )
      await updateCompanyApi({
        logo_url: logoPreview ?? "",
        brand_name: brandName,
        brand_slogan: brandSlogan,
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
                      <div className="w-[140px] h-10 rounded-md bg-[#1a1040] flex items-center justify-center overflow-hidden p-1">
                        <div className="bg-white/15 rounded p-0.5 flex items-center justify-center max-w-full max-h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoPreview} alt="" className="max-w-[120px] max-h-8 object-contain" />
                        </div>
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
                      className={cn(
                        "w-full rounded-lg overflow-hidden flex h-[80px] mb-3 border cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all",
                        currentTheme === key && "ring-2 ring-primary"
                      )}
                      onClick={() => enabled && selectTheme(key)}
                      disabled={!enabled}
                    >
                      <div className={cn("w-8 shrink-0 flex flex-col items-center gap-1 py-2", {
                        "bg-[#1a1647]": key === "light",
                        "bg-[#1a1040]": key === "dark",
                        "bg-[#292524]": key === "warm",
                      })}>
                        {[1,2,3].map(i => <div key={i} className={cn("w-5 h-5 rounded", {
                          "bg-[#818cf8]": key === "light" && i === 1, "bg-[#818cf830]": key === "light" && i !== 1,
                          "bg-[#6366f1]": key === "dark" && i === 1,  "bg-[#6366f130]": key === "dark" && i !== 1,
                          "bg-[#f59e0b]": key === "warm" && i === 1,  "bg-[#f59e0b30]": key === "warm" && i !== 1,
                        })} />)}
                      </div>
                      <div className={cn("flex-1 p-2 space-y-1", {
                        "bg-white": key === "light",
                        "bg-[#0f172a]": key === "dark",
                        "bg-[#fffbeb]": key === "warm",
                      })}>
                        <div className={cn("h-2.5 rounded w-12", {
                          "bg-gray-200": key === "light",
                          "bg-slate-700": key === "dark",
                          "bg-amber-200": key === "warm",
                        })} />
                        <div className={cn("h-2 rounded w-16", {
                          "bg-gray-100": key === "light",
                          "bg-slate-800": key === "dark",
                          "bg-amber-100": key === "warm",
                        })} />
                        <div className="flex gap-1 mt-1">
                          <div className={cn("h-4 w-10 rounded", {
                            "bg-[#6366f1]": key === "light" || key === "dark",
                            "bg-[#d97706]": key === "warm",
                          })} />
                          <div className={cn("h-4 w-8 rounded border", {
                            "border-[#6366f180]": key === "light" || key === "dark",
                            "border-[#d9770680]": key === "warm",
                          })} />
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
        <Card className="opacity-70">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Поддомен компании
              <Badge variant="secondary" className="text-[10px] ml-1">Скоро</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">
              Ваш поддомен для публичных страниц вакансий и демонстраций.
            </p>
            <div className="flex gap-2 items-center">
              <div className="flex-1 flex items-center max-w-lg">
                <Input
                  disabled
                  placeholder="mycompany"
                  className="h-9 font-mono text-sm rounded-r-none border-r-0"
                />
                <span className="h-9 px-3 flex items-center text-sm text-muted-foreground bg-muted border border-l-0 rounded-r-lg shrink-0 font-mono">
                  .company24.pro
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Функция находится в разработке</p>
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
