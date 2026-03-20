"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Loader2, Building2, CheckCircle2, Upload, Save,
  Phone, Mail, Globe, MapPin, Calendar, Users, Briefcase,
  FileText, CreditCard, Info, Eye, Palette, Lock, Play,
  Plus,
} from "lucide-react"
import { saveBrand, BRAND_PRESETS, canCustomizeBrand, canCustomDomain, type BrandConfig } from "@/lib/branding"

// ─── Мок-данные DaData ──────────────────────────────────────

const DADATA_MOCK: Record<string, DadataResult> = {
  "7707083893": {
    fullName: 'ООО «РОМАШКА»',
    shortName: 'ООО «Ромашка»',
    kpp: "770701001",
    ogrn: "1037707049388",
    legalAddress: "125009, г. Москва, ул. Тверская, д. 1",
    director: "Иванов Александр Сергеевич",
    status: "active",
  },
  "7736050003": {
    fullName: 'ПАО «ГАЗПРОМ»',
    shortName: "ПАО «Газпром»",
    kpp: "773601001",
    ogrn: "1027700070518",
    legalAddress: "117997, г. Москва, ул. Наметкина, д. 16",
    director: "Миллер Алексей Борисович",
    status: "active",
  },
}

interface DadataResult {
  fullName: string
  shortName: string
  kpp: string
  ogrn: string
  legalAddress: string
  director: string
  status: "active" | "liquidated"
}

// ─── Банковский счёт ─────────────────────────────────────────

interface BankAccount {
  id: string
  bankName: string
  bik: string
  rs: string
  ks: string
}

function BankAccountItem({
  account,
  isDefault,
  onSetDefault,
  onChange,
  onRemove,
}: {
  account: BankAccount
  isDefault: boolean
  onSetDefault: () => void
  onChange: (updated: BankAccount) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Радио «По умолчанию» */}
      <button
        type="button"
        onClick={onSetDefault}
        title="Сделать основным"
        className="shrink-0"
      >
        <div className={cn(
          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
          isDefault ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary/60"
        )}>
          {isDefault && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </button>

      {/* Поля в одну строку */}
      <div className="grid grid-cols-4 gap-2 flex-1">
        <Input
          value={account.bankName}
          onChange={e => onChange({ ...account, bankName: e.target.value })}
          placeholder="Банк"
          className="h-8 text-sm"
        />
        <Input
          value={account.bik}
          onChange={e => onChange({ ...account, bik: e.target.value })}
          placeholder="БИК"
          className="h-8 text-sm font-mono"
        />
        <Input
          value={account.rs}
          onChange={e => onChange({ ...account, rs: e.target.value })}
          placeholder="Расчётный счёт"
          className="h-8 text-sm font-mono"
        />
        <Input
          value={account.ks}
          onChange={e => onChange({ ...account, ks: e.target.value })}
          placeholder="Корр. счёт"
          className="h-8 text-sm font-mono"
        />
      </div>

      {/* Удалить */}
      <button
        type="button"
        onClick={onRemove}
        title="Удалить счёт"
        className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
  )
}

// ─── Компонент ──────────────────────────────────────────────

let _nextId = 2

export default function CompanyProfilePage() {
  // ИНН и поиск
  const [inn, setInn] = useState("")
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState(false)

  // Юрлицо
  const [fullName, setFullName] = useState("")
  const [shortName, setShortName] = useState("")
  const [kpp, setKpp] = useState("")
  const [ogrn, setOgrn] = useState("")
  const [legalAddress, setLegalAddress] = useState("")
  const [director, setDirector] = useState("")
  const [companyStatus, setCompanyStatus] = useState<"active" | "liquidated" | "">("")

  // Почтовый адрес
  const [postalSameAsLegal, setPostalSameAsLegal] = useState(false)
  const [postalAddress, setPostalAddress] = useState("")

  // Банк — список счетов
  const [accounts, setAccounts] = useState<BankAccount[]>([
    { id: "1", bankName: "", bik: "", rs: "", ks: "" },
  ])
  const [defaultAccountId, setDefaultAccountId] = useState("1")

  // Контакты
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [website, setWebsite] = useState("")
  const [city, setCity] = useState("")

  // Демонстрация
  const [description, setDescription] = useState("")
  const [foundedYear, setFoundedYear] = useState("")
  const [employeeCount, setEmployeeCount] = useState("")
  const [industry, setIndustry] = useState("")
  const [officeAddress, setOfficeAddress] = useState("")
  const [schedule, setSchedule] = useState("")

  // Логотип
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Брендинг
  const [brandPrimary, setBrandPrimary] = useState("#3b82f6")
  const [brandBg, setBrandBg] = useState("#f0f4ff")
  const [brandText, setBrandText] = useState("#1e293b")
  const [brandPlan] = useState<BrandConfig["plan"]>("business")
  const canBrand = canCustomizeBrand(brandPlan)
  const canDomain = canCustomDomain(brandPlan)

  const handleSearch = async () => {
    if (!inn.trim()) {
      toast.error("Введите ИНН")
      return
    }
    setSearching(true)
    await new Promise(r => setTimeout(r, 1000))

    const result = DADATA_MOCK[inn.trim()]
    if (result) {
      setFullName(result.fullName)
      setShortName(result.shortName)
      setKpp(result.kpp)
      setOgrn(result.ogrn)
      setLegalAddress(result.legalAddress)
      setDirector(result.director)
      setCompanyStatus(result.status)
      setFound(true)
      toast.success("Компания найдена")
    } else {
      toast.error("Компания не найдена. Проверьте ИНН.")
      setFound(false)
    }
    setSearching(false)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Файл слишком большой. Максимум 2 МБ")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    saveBrand({ primaryColor: brandPrimary, bgColor: brandBg, textColor: brandText, logoUrl: logoPreview, companyName: shortName || fullName })
    toast.success("Профиль компании сохранён")
  }

  const addAccount = () => {
    const id = String(_nextId++)
    setAccounts(prev => [...prev, { id, bankName: "", bik: "", rs: "", ks: "" }])
  }

  const updateAccount = (updated: BankAccount) => {
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  const removeAccount = (id: string) => {
    setAccounts(prev => {
      const next = prev.filter(a => a.id !== id)
      if (defaultAccountId === id && next.length > 0) setDefaultAccountId(next[0].id)
      return next
    })
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            <div className="mb-4">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Профиль компании</h1>
              <p className="text-muted-foreground text-sm">Данные организации и настройки для демонстраций</p>
            </div>

            <div className="space-y-3">
              {/* ═══ Компания ═══════════════════════════════════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Компания
                    {companyStatus === "active" && (
                      <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Действующая
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* ИНН */}
                    <div className="space-y-1">
                      <Label className="text-sm">ИНН</Label>
                      <div className="relative">
                        <Input
                          value={inn}
                          onChange={e => setInn(e.target.value.replace(/\D/g, ""))}
                          placeholder="7707083893"
                          maxLength={12}
                          className="font-mono pr-8"
                          onKeyDown={e => { if (e.key === "Enter") handleSearch() }}
                        />
                        {searching && (
                          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">Введите ИНН и нажмите Enter для автозаполнения</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">КПП</Label>
                      <Input value={kpp} onChange={e => setKpp(e.target.value)} placeholder="770701001" className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Полное название</Label>
                      <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder='ООО «РОМАШКА»' />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Краткое название</Label>
                      <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder='ООО «Ромашка»' />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">ОГРН</Label>
                      <Input value={ogrn} onChange={e => setOgrn(e.target.value)} placeholder="1037707049388" className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Руководитель</Label>
                      <Input value={director} onChange={e => setDirector(e.target.value)} placeholder="Иванов А.С." />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-sm">Юридический адрес</Label>
                      <Input value={legalAddress} onChange={e => setLegalAddress(e.target.value)} placeholder="125009, г. Москва, ул. Тверская, д. 1" />
                    </div>
                    {/* Почтовый адрес */}
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-sm">Почтовый адрес</Label>
                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          id="postal-same"
                          checked={postalSameAsLegal}
                          onChange={e => {
                            setPostalSameAsLegal(e.target.checked)
                            if (e.target.checked) setPostalAddress(legalAddress)
                          }}
                          className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                        />
                        <label htmlFor="postal-same" className="text-sm text-muted-foreground cursor-pointer select-none">
                          Совпадает с юридическим
                        </label>
                      </div>
                      {!postalSameAsLegal && (
                        <Input
                          value={postalAddress}
                          onChange={e => setPostalAddress(e.target.value)}
                          placeholder="125009, г. Москва, ул. Тверская, д. 1"
                        />
                      )}
                    </div>
                    {/* Контакты */}
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email</Label>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hr@romashka.ru" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Телефон</Label>
                      <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (495) 123-45-67" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-muted-foreground" /> Сайт</Label>
                      <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://romashka.ru" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Город</Label>
                      <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ═══ Банковские реквизиты — список счетов ═══════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Банковские реквизиты
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-2">
                  {accounts.map(account => (
                    <BankAccountItem
                      key={account.id}
                      account={account}
                      isDefault={account.id === defaultAccountId}
                      onSetDefault={() => setDefaultAccountId(account.id)}
                      onChange={updateAccount}
                      onRemove={() => removeAccount(account.id)}
                    />
                  ))}
                  {accounts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Счетов ещё нет.
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 mt-1" onClick={addAccount}>
                    <Plus className="w-3.5 h-3.5" />
                    Добавить счёт
                  </Button>
                </CardContent>
              </Card>

              {/* ═══ Данные для демонстрации ════════════════════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Данные для демонстрации должности
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      Эти данные подставляются в шаблоны демонстрации через переменные: {"{{компания_описание}}"}, {"{{год_основания}}"}, {"{{сотрудников}}"} и т.д.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm flex items-center gap-2">
                      Описание компании
                      <Badge variant="outline" className="text-[10px] font-mono">{"{{компания_описание}}"}</Badge>
                    </Label>
                    <textarea
                      className="w-full border rounded-lg p-2.5 text-sm resize-none h-20 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Современная компания, специализирующаяся на..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Год основания
                        <Badge variant="outline" className="text-[10px] font-mono">{"{{год_основания}}"}</Badge>
                      </Label>
                      <Input value={foundedYear} onChange={e => setFoundedYear(e.target.value)} placeholder="2018" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" /> Количество сотрудников
                        <Badge variant="outline" className="text-[10px] font-mono">{"{{сотрудников}}"}</Badge>
                      </Label>
                      <Input value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="150" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Сфера деятельности
                        <Badge variant="outline" className="text-[10px] font-mono">{"{{сфера}}"}</Badge>
                      </Label>
                      <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="IT, B2B продажи" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Адрес офиса
                        <Badge variant="outline" className="text-[10px] font-mono">{"{{адрес_офиса}}"}</Badge>
                      </Label>
                      <Input value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder="ул. Примерная, 1" />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-sm flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" /> График работы
                        <Badge variant="outline" className="text-[10px] font-mono">{"{{график}}"}</Badge>
                      </Label>
                      <Input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="Пн-Пт, 9:00-18:00" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ═══ Брендинг ═══════════════════════════════════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Брендинг
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
                      <Label className="text-sm">Основной цвет (акцент)</Label>
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
                        {logoPreview ? (
                          <img src={logoPreview} alt="Логотип" className="w-full h-full object-contain rounded-xl p-1.5" />
                        ) : (
                          <Upload className="w-5 h-5 text-muted-foreground" />
                        )}
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
                    <div
                      className="rounded-xl border overflow-hidden"
                      style={{ backgroundColor: canBrand ? brandBg : "#f0f4ff" }}
                    >
                      <div className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-2">
                          {logoPreview ? (
                            <img src={logoPreview} alt="" className="w-9 h-9 rounded-lg object-contain" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: canBrand ? brandPrimary : "#3b82f6" }}>
                              {shortName ? shortName[0] : "К"}
                            </div>
                          )}
                          <span className="text-base font-bold" style={{ color: canBrand ? brandText : "#1e293b" }}>
                            {shortName || "Название компании"}
                          </span>
                        </div>
                        {/* Content preview */}
                        <div>
                          <h3 className="text-lg font-bold" style={{ color: canBrand ? brandText : "#1e293b" }}>Привет, Иван! 👋</h3>
                          <p className="text-sm mt-1" style={{ color: canBrand ? brandText + "99" : "#64748b" }}>Менеджер по продажам · {shortName || "Компания"}</p>
                        </div>
                        {/* Button */}
                        <div className="flex gap-2">
                          <div className="h-10 px-5 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: canBrand ? brandPrimary : "#3b82f6" }}>
                            <Play className="w-4 h-4 mr-1.5" /> Начать демонстрацию
                          </div>
                        </div>
                        {/* Progress preview */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs" style={{ color: canBrand ? brandText + "80" : "#94a3b8" }}>
                            <span>Урок 3 из 12</span><span>25%</span>
                          </div>
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

              {/* ═══ Сохранить ══════════════════════════════════ */}
              <div className="flex justify-end pb-4">
                <Button size="lg" className="gap-2" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                  Сохранить профиль
                </Button>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
