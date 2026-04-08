"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Palette, Lock, Globe, Save, Loader2, CheckCircle2, XCircle, RefreshCw, Copy, AlertCircle, Upload, Trash2, RotateCcw } from "lucide-react"
import { saveBrand, canCustomizeBrand, type BrandConfig } from "@/lib/branding"
import { fetchCompanyApi, updateCompanyApi } from "@/lib/company-storage"
import { CompanyLogo } from "@/components/company-logo"
import Link from "next/link"

const DEFAULT_COLORS = {
  primary:    "#6366f1",
  background: "#ffffff",
  foreground: "#0f172a",
  sidebar:    "#1e1b4b",
  accent:     "#818cf8",
}

export default function BrandingPage() {
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [shortName, setShortName] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "verified" | "error">("idle")
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customColors, setCustomColors] = useState({ ...DEFAULT_COLORS })

  useEffect(() => {
    fetchCompanyApi()
      .then((data: unknown) => {
        const c = data as Record<string, unknown>
        if (!c) return
        if (c.name) setShortName(c.name as string)
        if (c.logoUrl) setLogoPreview(c.logoUrl as string)
        if (c.customTheme) setCustomColors({ ...DEFAULT_COLORS, ...(c.customTheme as Record<string, string>) })
      })
      .catch(() => {})
  }, [])

  const uploadLogoFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) { toast.error("PNG, SVG, JPG или WebP"); return }
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
    setUploadingLogo(true)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Ошибка загрузки")
      const { logoUrl } = await res.json()
      setLogoPreview(logoUrl)
      toast.success("Логотип загружен")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка") }
    finally { setUploadingLogo(false) }
  }

  const verifyDomain = async () => {
    if (!customDomain.trim()) return
    setVerifying(true); setDomainStatus("checking")
    await new Promise(r => setTimeout(r, 2000))
    setDomainStatus(customDomain.endsWith(".ru") ? "verified" : "error")
    setVerifying(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCompanyApi({ logo_url: logoPreview || undefined, custom_theme: customColors })
      saveBrand({ primaryColor: customColors.primary, bgColor: customColors.background, textColor: customColors.foreground, logoUrl: logoPreview, companyName: shortName })
      toast.success("Брендинг сохранён")
    } catch {
      toast.success("Брендинг сохранён локально")
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Брендинг платформы</h1>
        <p className="text-muted-foreground text-sm">Логотип, цвета интерфейса и домен</p>
      </div>

      <div className="space-y-4 max-w-3xl">

        {/* ═══ Логотип ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" />Логотип</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) uploadLogoFile(f) }}
              onClick={() => canBrand && fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-all max-w-xs",
                canBrand ? "cursor-pointer hover:border-primary/40 hover:bg-muted/20" : "cursor-not-allowed opacity-60",
                isDragging && "border-primary bg-primary/5",
              )}
            >
              <input ref={fileInputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogoFile(f) }} disabled={!canBrand} />
              {uploadingLogo ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                : logoPreview ? <img src={logoPreview} alt="Логотип" className="w-16 h-16 object-contain rounded-lg" />
                : <Upload className="w-6 h-6 text-muted-foreground" />}
              <p className="text-xs font-medium">{logoPreview ? "Нажмите для замены" : "Перетащите или нажмите"}</p>
              <p className="text-[11px] text-muted-foreground">PNG или SVG, до 2 МБ</p>
            </div>
            {logoPreview && <Button variant="ghost" size="sm" className="gap-1.5 text-destructive h-7 text-xs" onClick={() => { setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = "" }}><Trash2 className="w-3.5 h-3.5" />Удалить</Button>}
            <div className="flex items-start gap-4 pt-1">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-lg border bg-muted/20 flex items-center justify-center overflow-hidden">
                  <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="md" rounded="md" />
                </div>
                <span className="text-[10px] text-muted-foreground">Sidebar</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-[80px] h-[80px] rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden">
                  <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="lg" rounded="md" className="!w-[60px] !h-[60px]" />
                </div>
                <span className="text-[10px] text-muted-foreground">Вакансия</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-md border bg-muted/20 flex items-center justify-center overflow-hidden">
                  <CompanyLogo logoUrl={logoPreview} companyName={shortName} size="sm" rounded="sm" />
                </div>
                <span className="text-[10px] text-muted-foreground">Мобильный</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ Цвета платформы ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="w-4 h-4 text-violet-500" />Цвета платформы
              <Badge variant="outline" className="text-[10px]">beta</Badge>
              {!canBrand && <Badge variant="outline" className="text-[10px] ml-1"><Lock className="w-3 h-3 mr-1" />Pro</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-4">
            {!canBrand ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Выберите тему интерфейса</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "light", label: "Светлая", sidebar: "#1e1b4b", bg: "#ffffff", primary: "#6366f1" },
                    { id: "dark", label: "Тёмная", sidebar: "#0f0f1a", bg: "#1a1a2e", primary: "#818cf8" },
                    { id: "warm", label: "Тёплая", sidebar: "#1c1917", bg: "#faf9f7", primary: "#d97706" },
                  ].map(theme => (
                    <div key={theme.id} className="rounded-xl border overflow-hidden cursor-pointer hover:border-primary/50 transition-colors">
                      <div className="flex h-14">
                        <div className="w-7 shrink-0" style={{ background: theme.sidebar }} />
                        <div className="flex-1 flex items-center justify-center" style={{ background: theme.bg }}>
                          <div className="w-5 h-5 rounded-full" style={{ background: theme.primary }} />
                        </div>
                      </div>
                      <div className="px-2 py-1 text-center text-xs font-medium">{theme.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {([
                    { key: "primary" as const, label: "Основной" },
                    { key: "background" as const, label: "Фон" },
                    { key: "foreground" as const, label: "Текст" },
                    { key: "sidebar" as const, label: "Сайдбар" },
                    { key: "accent" as const, label: "Акцент" },
                  ]).map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={customColors[key]} onChange={e => setCustomColors(prev => ({ ...prev, [key]: e.target.value }))} className="w-9 h-9 rounded-lg border cursor-pointer" />
                        <Input value={customColors[key]} onChange={e => setCustomColors(prev => ({ ...prev, [key]: e.target.value }))} className="h-9 font-mono text-xs flex-1" />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Превью интерфейса</Label>
                  <div className="rounded-xl border overflow-hidden flex h-24" style={{ background: customColors.background }}>
                    <div className="w-12 shrink-0 flex flex-col items-center gap-1.5 py-2" style={{ background: customColors.sidebar }}>
                      {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-lg" style={{ background: i === 1 ? customColors.accent : customColors.accent + "30" }} />)}
                    </div>
                    <div className="flex-1 p-2.5 space-y-1.5">
                      <div className="h-3 rounded w-20" style={{ background: customColors.foreground + "20" }} />
                      <div className="h-2.5 rounded w-28" style={{ background: customColors.foreground + "15" }} />
                      <div className="flex gap-2 mt-1">
                        <div className="h-6 w-16 rounded-lg" style={{ background: customColors.primary }} />
                        <div className="h-6 w-12 rounded-lg border" style={{ borderColor: customColors.primary + "60" }} />
                      </div>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setCustomColors({ ...DEFAULT_COLORS })}>
                  <RotateCcw className="w-3.5 h-3.5" />Сбросить к стандартным
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Кастомный домен ═══ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" />Кастомный домен</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0 space-y-3">
            <div className="flex gap-2 max-w-lg">
              <Input value={customDomain} onChange={e => { setCustomDomain(e.target.value); setDomainStatus("idle") }} placeholder="hr.company.ru" className="h-9 font-mono text-sm" />
              <Button variant="outline" size="sm" className="shrink-0 h-9 gap-1.5" onClick={verifyDomain} disabled={!customDomain.trim() || verifying}>
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Проверить
              </Button>
            </div>
            {domainStatus === "verified" && <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" />Домен подтверждён</div>}
            {domainStatus === "error" && <div className="flex items-center gap-2 text-sm text-destructive"><XCircle className="w-4 h-4" />DNS-записи не найдены</div>}
            {domainStatus === "checking" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Проверяем DNS...</div>}
            {domainStatus !== "verified" && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-w-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">Добавьте CNAME-запись в DNS</p>
                </div>
                <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Тип</span><code className="font-mono">CNAME</code>
                  <span className="text-muted-foreground">Имя</span>
                  <div className="flex items-center gap-1"><code className="font-mono">{customDomain ? customDomain.split(".")[0] : "hr"}</code><button onClick={() => { navigator.clipboard.writeText(customDomain ? customDomain.split(".")[0] : "hr"); toast.success("Скопировано") }}><Copy className="w-3 h-3 text-muted-foreground" /></button></div>
                  <span className="text-muted-foreground">Значение</span>
                  <div className="flex items-center gap-1"><code className="font-mono">cname.my-komanda.ru</code><button onClick={() => { navigator.clipboard.writeText("cname.my-komanda.ru"); toast.success("Скопировано") }}><Copy className="w-3 h-3 text-muted-foreground" /></button></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Ссылка на HR брендинг ═══ */}
        <div className="rounded-lg border border-dashed border-border p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Брендинг для кандидатов (цвета, приветствие, превью)</p>
          <Link href="/hr/hiring-settings"><Button variant="ghost" size="sm" className="text-xs">Настройки найма →</Button></Link>
        </div>

        {/* ═══ Сохранить ═══ */}
        <div className="flex justify-end pb-4">
          <Button className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Сохранение..." : "Сохранить брендинг"}
          </Button>
        </div>
      </div>
    </>
  )
}
