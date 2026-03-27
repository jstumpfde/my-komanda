"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Palette, Lock, Globe, Upload, Play, Save, Loader2 } from "lucide-react"
import { saveBrand, BRAND_PRESETS, canCustomizeBrand, canCustomDomain, type BrandConfig } from "@/lib/branding"
import { fetchCompanyApi, updateCompanyApi } from "@/lib/company-storage"

export default function BrandingPage() {
  const [brandPrimary, setBrandPrimary] = useState("#3b82f6")
  const [brandBg, setBrandBg] = useState("#f0f4ff")
  const [brandText, setBrandText] = useState("#1e293b")
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const canDomain = canCustomDomain(brandPlan)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [shortName, setShortName] = useState("")
  const [greetingTemplate, setGreetingTemplate] = useState("Привет, {name}! 👋")
  const [saving, setSaving] = useState(false)

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
      })
      .catch(() => {})
  }, [])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error("Файл слишком большой. Максимум 2 МБ"); return }
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCompanyApi({
        logo_url: logoPreview || undefined,
        brand_primary_color: brandPrimary,
        brand_bg_color: brandBg,
        brand_text_color: brandText,
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
        <h1 className="text-2xl font-semibold text-foreground mb-1">Брендинг</h1>
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

            {/* Логотип */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Логотип</Label>
              <div className="flex items-center gap-4">
                <label className={cn("flex flex-col items-center justify-center w-20 h-20 rounded-xl border-2 border-dashed transition-all", canBrand ? "border-border hover:border-primary/30 cursor-pointer bg-muted/20 hover:bg-muted/40" : "border-border/50 bg-muted/10 cursor-not-allowed")}>
                  <input type="file" accept=".png,.svg,.jpg,.jpeg" className="hidden" onChange={handleLogoUpload} disabled={!canBrand} />
                  {logoPreview ? <img src={logoPreview} alt="Логотип" className="w-full h-full object-contain rounded-xl p-1.5" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
                </label>
                <div className="text-xs text-muted-foreground">PNG / SVG, до 2 МБ<br />Рекомендуем 200×200px</div>
              </div>
            </div>

            {/* Кастомный домен */}
            <div className="space-y-1">
              <Label className="text-sm flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Кастомный домен
                {!canDomain && <Badge variant="outline" className="text-[10px]">только Pro</Badge>}
              </Label>
              <Input value="hr.romashka.ru" disabled={!canDomain} className="h-9 w-64" placeholder="hr.company.ru" />
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
