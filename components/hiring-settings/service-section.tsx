"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import {
  ShieldAlert, Save, Loader2, ChevronDown, ChevronUp, GripVertical, Plus, Trash2,
  Upload, X, ExternalLink, Building2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CompanyHiringDefaults } from "@/lib/db/schema"

// ─── Типы ────────────────────────────────────────────────────────────────────

type BrandCompany = {
  id: string
  name: string
  slogan?: string
  description?: string
  logo?: string
  website?: string
}

// Данные основной компании, загружаемые из /api/companies
type MainCompanyData = {
  name: string
  brandName: string | null
  logoUrl: string | null
  brandSlogan: string | null
  website: string | null
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export function ServiceSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  return (
    <div className="space-y-5">
      <DataRetentionBlock defaults={defaults} onPatch={onPatch} />
      <AiKillSwitchBlock />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Хранение данных (ФЗ-152)
// ─────────────────────────────────────────────────────────────────────────────

function DataRetentionBlock({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const [dataRetention, setDataRetention] = useState<string>(defaults.dataRetention ?? "6months")
  const [saving, setSaving] = useState(false)

  const handleChange = async (val: string) => {
    setDataRetention(val)
    setSaving(true)
    try {
      await onPatch({ dataRetention: val })
      toast.success("Настройки хранения данных сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Хранение данных кандидатов</CardTitle>
        <CardDescription>В соответствии с ФЗ-152 персональные данные отказанных кандидатов будут автоматически удалены</CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={dataRetention} onValueChange={handleChange} disabled={saving}>
          <SelectTrigger className="w-[280px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">Сразу после отказа</SelectItem>
            <SelectItem value="7days">7 дней</SelectItem>
            <SelectItem value="30days">30 дней</SelectItem>
            <SelectItem value="3months">3 месяца</SelectItem>
            <SelectItem value="6months">6 месяцев</SelectItem>
            <SelectItem value="12months">12 месяцев</SelectItem>
            <SelectItem value="never">Не удалять</SelectItem>
          </SelectContent>
        </Select>
        {(dataRetention === "12months" || dataRetention === "never") && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
              <b>Внимание (ФЗ-152):</b> хранение персональных данных отказанных кандидатов
              дольше необходимого для целей обработки может нарушать закон. Убедитесь, что
              у вас есть правовое основание хранить данные{" "}
              {dataRetention === "never" ? "бессрочно" : "12 месяцев"}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Webhooks
// ─────────────────────────────────────────────────────────────────────────────

export function WebhooksBlock({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const [webhookUrl, setWebhookUrl] = useState<string>(defaults.webhooks?.url ?? "")
  const [webhookEvents, setWebhookEvents] = useState<Record<string, boolean>>({
    new_candidate: false,
    ai_screening: false,
    stage_change: false,
    offer: false,
    reject: false,
    ...(defaults.webhooks?.events ?? {}),
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onPatch({ webhooks: { url: webhookUrl, events: webhookEvents } })
      toast.success("Настройки webhook сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Webhooks</CardTitle>
        <CardDescription>
          Отправлять события в внешние системы. Это дефолт для всех вакансий
          компании — в настройках конкретной вакансии (вкладка «Интеграции») можно
          задать свой webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">URL для отправки</Label>
          <Input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">События</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {([
              ["new_candidate", "Новый кандидат"],
              ["ai_screening", "AI-скрининг"],
              ["stage_change", "Смена этапа"],
              ["offer", "Оффер"],
              ["reject", "Отказ"],
            ] as [string, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={webhookEvents[key] || false}
                  onChange={e => setWebhookEvents(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Битрикс24
// ─────────────────────────────────────────────────────────────────────────────

export function BitrixBlock({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const [bitrixUrl, setBitrixUrl] = useState<string>(defaults.bitrix?.url ?? "")
  const [bitrixTrigger, setBitrixTrigger] = useState<string>(defaults.bitrix?.trigger ?? "offer")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onPatch({ bitrix: { url: bitrixUrl, trigger: bitrixTrigger } })
      toast.success("Интеграция с Битрикс24 сохранена")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const checkBitrix = async () => {
    if (!bitrixUrl.trim()) { toast.error("Сначала укажите Webhook URL"); return }
    setTesting(true)
    try {
      const res = await fetch("/api/modules/hr/company/bitrix-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bitrixUrl.trim() }),
      })
      const d = await res.json() as { ok?: boolean; error?: string }
      if (d.ok) toast.success("Связь с Битрикс24 установлена ✓")
      else toast.error(d.error || "Связь не установлена")
    } catch {
      toast.error("Ошибка проверки")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Интеграция с Битрикс24</CardTitle>
        <CardDescription>
          Отправлять кандидатов в CRM Битрикс24. Дефолт для всех вакансий — в
          настройках вакансии («Интеграции») можно переопределить.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Webhook URL Битрикс24</Label>
          <Input
            value={bitrixUrl}
            onChange={e => setBitrixUrl(e.target.value)}
            placeholder="https://your-domain.bitrix24.ru/rest/1/..."
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Когда отправлять</Label>
          <Select value={bitrixTrigger} onValueChange={setBitrixTrigger}>
            <SelectTrigger className="w-[250px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кандидаты</SelectItem>
              <SelectItem value="qualified">Только подходящие (AI 70+)</SelectItem>
              <SelectItem value="offer">Только на этапе оффера</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Сохранить
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={checkBitrix}
            disabled={testing || !bitrixUrl.trim()}
          >
            {testing ? "Проверка…" : "Проверить связь"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          При достижении выбранного этапа кандидат создаётся лидом в Битрикс24 (crm.lead.add).
        </p>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Мультикомпания / выбор компании в анкете
// ─────────────────────────────────────────────────────────────────────────────

export function MultiCompanyBlock({ defaults, onPatch, renderProducts }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
  // ТЗ Option B: вкладывает редактор продуктов внутрь карточки каждой компании.
  // companyKey: "" — основная (productProfiles), иначе id бренда.
  renderProducts?: (companyKey: string) => ReactNode
}) {
  const [showCompanySelector, setShowCompanySelector] = useState<boolean>(!!defaults.showCompanySelector)
  const [brandCompanies, setBrandCompanies] = useState<BrandCompany[]>(
    Array.isArray(defaults.brandCompanies) ? (defaults.brandCompanies as BrandCompany[]) : []
  )
  const [defaultBrandCompanyId, setDefaultBrandCompanyId] = useState<string>(
    defaults.defaultBrandCompanyId ?? ""
  )
  const [brandsExpanded, setBrandsExpanded] = useState(false)
  const [dragBrandId, setDragBrandId] = useState<string | null>(null)
  // Сворачивание карточки компании: ключ "" — основная, иначе id бренда.
  const [collapsedCos, setCollapsedCos] = useState<Record<string, boolean>>({})
  const toggleCo = (k: string) => setCollapsedCos(s => ({ ...s, [k]: !s[k] }))

  // Основная компания (из /api/companies)
  const [mainCompany, setMainCompany] = useState<MainCompanyData | null>(null)
  const [companyDescription, setCompanyDescription] = useState("")
  const [savingCompanyDesc, setSavingCompanyDesc] = useState(false)

  // Загрузка логотипа бренд-компании: refs для скрытых file input
  const logoInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Состояние загрузки логотипа (id компании → true/false)
  const [logoUploading, setLogoUploading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch("/api/companies")
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j) return
        if (typeof j.companyDescription === "string") setCompanyDescription(j.companyDescription)
        setMainCompany({
          name: j.name ?? "",
          brandName: j.brandName ?? null,
          logoUrl: j.logoUrl ?? null,
          brandSlogan: j.brandSlogan ?? null,
          website: j.website ?? null,
        })
      })
      .catch(() => {})
  }, [])

  const saveCompanyDescription = async () => {
    setSavingCompanyDesc(true)
    try {
      const res = await fetch("/api/companies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_description: companyDescription }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success("Описание компании сохранено")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingCompanyDesc(false)
    }
  }

  const toggleCompanySelector = async (checked: boolean) => {
    setShowCompanySelector(checked)
    try {
      await onPatch({ showCompanySelector: checked })
      toast.success(checked ? "Выбор компании включён в анкете" : "Секция «Компания» скрыта")
    } catch {
      toast.error("Не удалось сохранить")
    }
  }

  const persistCompanies = async (list: BrandCompany[]) => {
    setBrandCompanies(list)
    try {
      await onPatch({ brandCompanies: list })
    } catch {
      toast.error("Не удалось сохранить список")
    }
  }

  const addBrandCompany = () => {
    if (brandCompanies.length >= 30) { toast.error("Максимум 30 компаний"); return }
    persistCompanies([
      ...brandCompanies,
      { id: `bc-${Math.random().toString(36).slice(2, 9)}`, name: "", slogan: "", description: "", logo: "", website: "" },
    ])
  }

  const updateBrandCompany = (id: string, patch: Partial<BrandCompany>) =>
    setBrandCompanies(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const saveBrandCompany = () => persistCompanies(brandCompanies)

  const removeBrandCompany = (id: string) => {
    if (defaultBrandCompanyId === id) chooseDefaultCompany("")
    persistCompanies(brandCompanies.filter(c => c.id !== id))
  }

  const moveBrandCompany = (id: string, dir: -1 | 1) => {
    const idx = brandCompanies.findIndex(c => c.id === id)
    if (idx < 0) return
    const to = idx + dir
    if (to < 0 || to >= brandCompanies.length) return
    const list = [...brandCompanies]
    ;[list[idx], list[to]] = [list[to], list[idx]]
    persistCompanies(list)
  }

  const dropBrandOn = (targetId: string) => {
    if (!dragBrandId || dragBrandId === targetId) { setDragBrandId(null); return }
    const from = brandCompanies.findIndex(c => c.id === dragBrandId)
    const to = brandCompanies.findIndex(c => c.id === targetId)
    setDragBrandId(null)
    if (from < 0 || to < 0) return
    const list = [...brandCompanies]
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    persistCompanies(list)
  }

  const chooseDefaultCompany = async (id: string) => {
    setDefaultBrandCompanyId(id)
    try {
      await onPatch({ defaultBrandCompanyId: id })
      toast.success("Компания по умолчанию сохранена")
    } catch {
      toast.error("Не удалось сохранить")
    }
  }

  // Загрузка логотипа бренд-компании через /api/upload (возвращает URL)
  const handleBrandLogoFile = async (id: string, file: File) => {
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
    const MAX_SIZE = 2 * 1024 * 1024 // 2 МБ

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Только PNG, JPEG, WebP или SVG")
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error("Размер файла превышает 2 МБ")
      return
    }

    setLogoUploading(prev => ({ ...prev, [id]: true }))
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error || "Не удалось загрузить логотип")
        return
      }
      const data = await res.json() as { url: string }
      const url = data.url
      // Автосохраняем сразу после загрузки
      setBrandCompanies(prev => {
        const updated = prev.map(c => c.id === id ? { ...c, logo: url } : c)
        onPatch({ brandCompanies: updated }).catch(() => toast.error("Не удалось сохранить логотип"))
        return updated
      })
    } catch {
      toast.error("Ошибка при загрузке логотипа")
    } finally {
      setLogoUploading(prev => ({ ...prev, [id]: false }))
    }
  }

  // Санитизация ссылки на сайт: разрешаем только http/https, остальные схемы — plain text
  const sanitizeWebsiteHref = (website: string): string | null => {
    const lower = website.trim().toLowerCase()
    if (!lower) return null
    // Если уже http/https — вернуть как есть
    if (lower.startsWith("http://") || lower.startsWith("https://")) {
      // Но на всякий случай отклоняем javascript: внутри (не должно быть, но вдруг)
      if (lower.includes("javascript:")) return null
      return website.trim()
    }
    // Если нет схемы вообще — подставляем https://
    if (!lower.includes("://")) return "https://" + website.trim()
    // Чужая схема (ftp://, javascript:, data:, ...) — не делаем ссылкой
    return null
  }

  const mainDisplayName = mainCompany
    ? (mainCompany.brandName || mainCompany.name || "Основная компания")
    : "Основная компания"

  return (
    <div className="max-w-3xl space-y-4">
      {/* Рамка 1: переключатель мультикомпании — отдельной карточкой сверху */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Мультикомпания / выбор компании в анкете</CardTitle>
          <CardDescription>Несколько компаний/брендов для найма под клиентов (аутсорсинг/рекрутинг)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Выбор компании в анкете вакансии</p>
              <p className="text-xs text-muted-foreground mt-0.5">Несколько компаний/брендов для найма под клиентов (аутсорсинг/рекрутинг)</p>
            </div>
            <Switch checked={showCompanySelector} onCheckedChange={toggleCompanySelector} />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed rounded-md bg-muted/30 border px-3 py-2">
            <strong>Первая компания</strong> — основная (из настроек компании). Можно добавить дополнительные бренды (для аутсорсинга/нескольких юрлиц): загрузите логотип, название, слоган, сайт — и сможете выбирать их на вакансии. Если что-то не заполнено — на вакансии можно указать вручную.
          </p>
        </CardContent>
      </Card>

        {/* Рамка 2: основная компания (идентичность + продукты внутри) */}
        {(!showCompanySelector || brandsExpanded) && (
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            {/* Шапка карточки */}
            <div className="flex items-start gap-3">
              {/* Логотип */}
              <div className="shrink-0">
                {mainCompany?.logoUrl ? (
                  <img
                    src={mainCompany.logoUrl}
                    alt="Логотип"
                    className="w-10 h-10 rounded object-contain border bg-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{mainDisplayName}</span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-primary/10 text-primary shrink-0 font-medium">
                    №1 · Основная
                  </span>
                </div>
                {mainCompany?.brandSlogan ? (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{mainCompany.brandSlogan}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 italic">
                    Слоган не заполнен —{" "}
                    <a href="/settings/branding" className="underline underline-offset-2 text-primary/70 hover:text-primary">настроить</a>
                  </p>
                )}
                {mainCompany?.website ? (() => {
                  const safeHref = sanitizeWebsiteHref(mainCompany.website)
                  return safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-primary/70 hover:text-primary mt-0.5"
                    >
                      {mainCompany.website}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground mt-0.5">{mainCompany.website}</span>
                  )
                })() : (
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 italic">
                    Сайт не заполнен —{" "}
                    <a href="/settings/branding" className="underline underline-offset-2 text-primary/70 hover:text-primary">добавить</a>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleCo("")}
                title={collapsedCos[""] ? "Развернуть" : "Свернуть"}
                className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform", !collapsedCos[""] && "rotate-180")} />
              </button>
            </div>

            {!collapsedCos[""] && (<>
            {/* Подсказка про редактирование */}
            <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
              Логотип, название, слоган и сайт основной компании редактируются в{" "}
              <a href="/settings/branding" className="underline underline-offset-2 text-primary/70 hover:text-primary font-medium">
                настройках брендинга
              </a>.
            </p>

            {/* Описание — редактируемое */}
            <div className="space-y-1.5 pt-1 border-t">
              <Label className="text-xs">Описание для кандидатов (блок «О компании»)</Label>
              <Textarea
                value={companyDescription}
                onChange={e => setCompanyDescription(e.target.value)}
                placeholder="Кратко о компании: чем занимаетесь, чем интересны соискателю…"
                rows={4}
                className="text-sm bg-[var(--input-bg)]"
              />
              <div className="flex items-center justify-between">
                {showCompanySelector ? (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={defaultBrandCompanyId === ""}
                      onCheckedChange={() => chooseDefaultCompany("")}
                    />
                    По умолчанию
                  </label>
                ) : <span />}
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveCompanyDescription} disabled={savingCompanyDesc}>
                  <Save className="size-3.5" />Сохранить
                </Button>
              </div>
            </div>

            {/* Продукты основной компании — вложены в её карточку */}
            {renderProducts && <div className="pt-1 border-t">{renderProducts("")}</div>}
            </>)}
          </div>
        )}

        {/* Мультикомпания ВКЛ + СВЁРНУТО → компания по умолчанию */}
        {showCompanySelector && !brandsExpanded && (() => {
          const defBrand = defaultBrandCompanyId ? brandCompanies.find(c => c.id === defaultBrandCompanyId) : null
          const dName = defBrand ? (defBrand.name || "Без названия") : mainDisplayName
          const dDesc = defBrand ? (defBrand.description ?? "") : companyDescription
          const dLogo = defBrand ? (defBrand.logo ?? "") : (mainCompany?.logoUrl ?? "")
          return (
            <div className="rounded-lg border p-3 space-y-1.5 bg-muted/20">
              <div className="flex items-center gap-2.5">
                {dLogo ? (
                  <img src={dLogo} alt="" className="w-8 h-8 rounded object-contain border bg-white shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}
                <span className="text-sm font-semibold truncate flex-1">{dName}</span>
                <span className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 shrink-0">По умолчанию</span>
              </div>
              {dDesc
                ? <p className="text-xs text-muted-foreground line-clamp-2">{dDesc}</p>
                : <p className="text-xs text-muted-foreground/70 italic">Без описания</p>}
            </div>
          )
        })()}

        {/* Список брендов */}
        {showCompanySelector && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setBrandsExpanded(e => !e)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform", brandsExpanded && "rotate-180")} />
                {brandsExpanded ? "Свернуть" : `Показать все компании (${brandCompanies.length + 1})`}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => { setBrandsExpanded(true); addBrandCompany() }}
              >
                <Plus className="w-3.5 h-3.5" />Добавить компанию
              </Button>
            </div>

            {brandsExpanded && brandCompanies.length === 0 && (
              <p className="text-xs text-muted-foreground/70 italic px-1">Пока нет добавленных компаний. Нажмите «Добавить компанию».</p>
            )}
            {brandsExpanded && brandCompanies.length > 1 && (
              <p className="text-[11px] text-muted-foreground/70 px-1">Перетащите за «⠿» чтобы поменять порядок.</p>
            )}

            {brandsExpanded && brandCompanies.map((c, i) => (
              <div
                key={c.id}
                onDragOver={e => { if (dragBrandId) e.preventDefault() }}
                onDrop={() => dropBrandOn(c.id)}
                className={cn(
                  "rounded-lg border p-3 space-y-2.5 bg-muted/20 transition-shadow",
                  dragBrandId === c.id && "opacity-50",
                  dragBrandId && dragBrandId !== c.id && "ring-1 ring-primary/20"
                )}
              >
                {/* Строка заголовка: drag + номер + название + стрелки + удалить */}
                <div className="flex items-center gap-2">
                  <span
                    draggable
                    onDragStart={() => setDragBrandId(c.id)}
                    onDragEnd={() => setDragBrandId(null)}
                    title="Перетащить"
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground shrink-0">№{i + 2}</span>
                  <Input
                    value={c.name}
                    onChange={e => updateBrandCompany(c.id, { name: e.target.value })}
                    placeholder="Название компании *"
                    className="h-8 text-sm flex-1"
                  />
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      title="Выше"
                      disabled={i === 0}
                      onClick={() => moveBrandCompany(c.id, -1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Ниже"
                      disabled={i === brandCompanies.length - 1}
                      onClick={() => moveBrandCompany(c.id, 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    title="Удалить"
                    onClick={() => removeBrandCompany(c.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => toggleCo(c.id)}
                    title={collapsedCos[c.id] ? "Развернуть" : "Свернуть"}
                    className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <ChevronDown className={cn("w-4 h-4 transition-transform", !collapsedCos[c.id] && "rotate-180")} />
                  </button>
                </div>

                {!collapsedCos[c.id] && (<>
                {/* Логотип */}
                <div className="space-y-1">
                  <Label className="text-xs">Логотип</Label>
                  <div className="flex items-center gap-2">
                    {c.logo ? (
                      <>
                        <img
                          src={c.logo}
                          alt="Логотип"
                          className="w-10 h-10 rounded object-contain border bg-white shrink-0"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            updateBrandCompany(c.id, { logo: "" })
                            setBrandCompanies(prev => {
                              const updated = prev.map(bc => bc.id === c.id ? { ...bc, logo: "" } : bc)
                              onPatch({ brandCompanies: updated }).catch(() => {})
                              return updated
                            })
                          }}
                        >
                          <X className="w-3 h-3" />Удалить
                        </Button>
                      </>
                    ) : (
                      <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-muted-foreground/40" />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={!!logoUploading[c.id]}
                      onClick={() => logoInputRefs.current[c.id]?.click()}
                    >
                      <Upload className="w-3 h-3" />
                      {logoUploading[c.id] ? "Загрузка…" : (c.logo ? "Заменить" : "Загрузить")}
                    </Button>
                    <input
                      ref={el => { logoInputRefs.current[c.id] = el }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleBrandLogoFile(c.id, file)
                        e.target.value = ""
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP, SVG · до 2 МБ</span>
                  </div>
                </div>

                {/* Слоган */}
                <Input
                  value={c.slogan ?? ""}
                  onChange={e => updateBrandCompany(c.id, { slogan: e.target.value })}
                  placeholder="Слоган (необязательно)"
                  className="h-8 text-xs"
                />

                {/* Описание */}
                <Textarea
                  value={c.description ?? ""}
                  onChange={e => updateBrandCompany(c.id, { description: e.target.value })}
                  placeholder="Краткое описание для кандидатов"
                  rows={2}
                  className="text-xs"
                />

                {/* Сайт */}
                <div className="space-y-1">
                  <Label className="text-xs">Сайт компании</Label>
                  <Input
                    value={c.website ?? ""}
                    onChange={e => updateBrandCompany(c.id, { website: e.target.value })}
                    placeholder="https://example.com"
                    type="url"
                    className="h-8 text-xs"
                  />
                </div>

                {/* По умолчанию + Сохранить */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className={cn("flex items-center gap-2 text-xs", !c.name.trim() ? "opacity-40 pointer-events-none" : "cursor-pointer")}>
                    <Checkbox
                      checked={defaultBrandCompanyId === c.id}
                      onCheckedChange={() => chooseDefaultCompany(c.id)}
                      disabled={!c.name.trim()}
                    />
                    По умолчанию
                  </label>
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={saveBrandCompany} disabled={!c.name.trim()}>
                    <Save className="w-3.5 h-3.5" />Сохранить
                  </Button>
                </div>

                {/* Продукты этого бренда — вложены в его карточку (после ввода названия) */}
                {renderProducts && c.name.trim() !== "" && <div className="pt-1 border-t">{renderProducts(c.id)}</div>}
                </>)}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Аварийное отключение AI (kill switch)
//    Собственная логика: GET/PUT /api/modules/hr/company/ai-chatbot-kill-switch
//    и GET /api/modules/hr/company/ai-vacancies + PUT .../ai-chatbot
//    НЕ использует onPatch — это отдельный endpoint.
// ─────────────────────────────────────────────────────────────────────────────

function AiKillSwitchBlock() {
  const [aiChatbotKilled, setAiChatbotKilled] = useState(false)
  const [aiKillSaving, setAiKillSaving] = useState(false)
  const [aiVacExpanded, setAiVacExpanded] = useState(false)
  const [aiVacancies, setAiVacancies] = useState<Array<{ id: string; title: string; aiChatbotEnabled: boolean }>>([])
  const [aiVacLoading, setAiVacLoading] = useState(false)
  const [aiVacBusy, setAiVacBusy] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/modules/hr/company/ai-chatbot-kill-switch")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.killed === "boolean") setAiChatbotKilled(d.killed) })
      .catch(() => {})
  }, [])

  const toggleAiChatbotKill = async (checked: boolean) => {
    setAiKillSaving(true)
    setAiChatbotKilled(checked)
    try {
      const res = await fetch("/api/modules/hr/company/ai-chatbot-kill-switch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ killed: checked }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success(checked ? "AI-чат-бот заблокирован для всей компании" : "AI-чат-бот разблокирован")
    } catch {
      setAiChatbotKilled(!checked)
      toast.error("Не удалось сохранить")
    } finally {
      setAiKillSaving(false)
    }
  }

  const loadAiVacancies = async () => {
    setAiVacLoading(true)
    try {
      const r = await fetch("/api/modules/hr/company/ai-vacancies")
      const d = r.ok ? await r.json() : null
      setAiVacancies(Array.isArray(d?.vacancies) ? d.vacancies : [])
    } catch { /* ignore */ } finally {
      setAiVacLoading(false)
    }
  }

  const toggleVacancyAi = async (id: string, next: boolean) => {
    setAiVacBusy(id)
    setAiVacancies(prev => prev.map(v => v.id === id ? { ...v, aiChatbotEnabled: next } : v))
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}/ai-chatbot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success(next ? "AI-чат-бот включён для вакансии" : "AI-чат-бот отключён для вакансии")
    } catch {
      setAiVacancies(prev => prev.map(v => v.id === id ? { ...v, aiChatbotEnabled: !next } : v))
      toast.error("Не удалось сохранить")
    } finally {
      setAiVacBusy(null)
    }
  }

  return (
    <Card className={cn("max-w-3xl border-2", aiChatbotKilled ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : "border-amber-200")}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="size-4 text-red-600" />
          Аварийное отключение AI
        </CardTitle>
        <CardDescription>Глобальный рубильник AI-чат-бота на уровне компании.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Заблокировать AI-чат-бота для всех вакансий</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              При включении ВСЕ вакансии перестанут использовать AI-агента. Используйте только в аварии.
            </p>
          </div>
          <Switch
            checked={aiChatbotKilled}
            onCheckedChange={toggleAiChatbotKill}
            disabled={aiKillSaving}
          />
        </div>

        {/* Точечное отключение по вакансиям */}
        <div className="mt-3 pt-3 border-t">
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => {
              const n = !aiVacExpanded
              setAiVacExpanded(n)
              if (n && aiVacancies.length === 0) loadAiVacancies()
            }}
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", aiVacExpanded && "rotate-180")} />
            Точечно — по вакансиям
          </button>
          {aiVacExpanded && (
            <div className="mt-2 space-y-1.5">
              {aiVacLoading ? (
                <p className="text-xs text-muted-foreground">Загрузка…</p>
              ) : aiVacancies.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет вакансий с включённым AI-чат-ботом.</p>
              ) : aiVacancies.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
                  <span className="text-sm truncate">{v.title}</span>
                  <Switch
                    checked={v.aiChatbotEnabled}
                    disabled={aiVacBusy === v.id || aiChatbotKilled}
                    onCheckedChange={c => toggleVacancyAi(v.id, c)}
                  />
                </div>
              ))}
              {aiChatbotKilled && aiVacancies.length > 0 && (
                <p className="text-[11px] text-amber-700">
                  Глобальный рубильник включён — AI отключён у всех вакансий независимо от этих переключателей.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
