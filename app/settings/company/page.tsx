"use client"

import { useState, useRef, useEffect } from "react"
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

// ─── DaData API ──────────────────────────────────────────────

interface DadataResult {
  fullName: string
  shortName: string
  kpp: string
  ogrn: string
  legalAddress: string
  director: string
  status: "active" | "liquidated"
  inn?: string
  postalCode?: string
  city?: string
}

const DADATA_TOKEN = process.env.NEXT_PUBLIC_DADATA_TOKEN ?? ""
const DADATA_FIND_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party"
const DADATA_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party"

// Парсинг ответа DaData → DadataResult
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDadataSuggestion(s: any): DadataResult & { inn: string } {
  const d = s.data ?? {}
  const managementName: string = d.management?.name ?? d.managers?.[0]?.name ?? ""
  const address: string = d.address?.value ?? d.address?.unrestricted_value ?? ""
  const addrData = d.address?.data ?? {}
  const postalCode: string = addrData.postal_code ?? ""
  const city: string = addrData.city ?? addrData.settlement ?? addrData.region_with_type ?? ""
  const statusRaw: string = d.state?.status ?? ""
  return {
    inn: d.inn ?? "",
    fullName: s.unrestricted_value ?? s.value ?? "",
    shortName: s.value ?? "",
    kpp: d.kpp ?? "",
    ogrn: d.ogrn ?? "",
    legalAddress: address,
    director: managementName,
    status: statusRaw === "ACTIVE" ? "active" : statusRaw === "LIQUIDATED" ? "liquidated" : "active",
    postalCode,
    city,
  }
}

// Поиск по ИНН через DaData findById
async function dadataFindByInn(inn: string): Promise<(DadataResult & { inn: string }) | null> {
  if (!DADATA_TOKEN) return null
  try {
    const res = await fetch(DADATA_FIND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${DADATA_TOKEN}`,
      },
      body: JSON.stringify({ query: inn, count: 1 }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const suggestions = json.suggestions ?? []
    if (!suggestions.length) return null
    return parseDadataSuggestion(suggestions[0])
  } catch {
    return null
  }
}

// Поиск по названию через DaData suggest
async function dadataSuggestByName(query: string): Promise<Array<DadataResult & { inn: string }>> {
  if (!DADATA_TOKEN || query.trim().length < 2) return []
  try {
    const res = await fetch(DADATA_SUGGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Token ${DADATA_TOKEN}`,
      },
      body: JSON.stringify({ query: query.trim(), count: 5 }),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.suggestions ?? []).map(parseDadataSuggestion)
  } catch {
    return []
  }
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

  // Поиск по краткому названию
  const [nameSuggestions, setNameSuggestions] = useState<Array<DadataResult & { inn: string }>>([])
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameContainerRef = useRef<HTMLDivElement>(null)

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
  const [postalIndex, setPostalIndex] = useState("")
  const [postalCity, setPostalCity] = useState("")

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

  // Заполнить поля из результата DaData
  const applyDadataResult = (result: DadataResult & { inn?: string }) => {
    setFullName(result.fullName)
    setShortName(result.shortName)
    setKpp(result.kpp)
    setOgrn(result.ogrn)
    setLegalAddress(result.legalAddress)
    setDirector(result.director)
    setCompanyStatus(result.status)
    if (result.inn) setInn(result.inn)
    if (result.postalCode) setPostalIndex(result.postalCode)
    if (result.city) setPostalCity(result.city)
    setFound(true)
    setNameDropdownOpen(false)
    setNameSuggestions([])
    toast.success("Компания найдена — все поля заполнены")
  }

  const handleSearch = async () => {
    if (!inn.trim()) {
      toast.error("Введите ИНН")
      return
    }
    setSearching(true)
    const result = await dadataFindByInn(inn.trim())
    if (result) {
      applyDadataResult(result)
    } else {
      toast.error("Компания не найдена. Проверьте ИНН или токен DaData.")
      setFound(false)
    }
    setSearching(false)
  }

  // Дебаунс поиска по краткому названию
  const handleShortNameChange = (value: string) => {
    setShortName(value)
    setNameDropdownOpen(false)
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    if (value.trim().length >= 2) {
      nameDebounceRef.current = setTimeout(async () => {
        const suggestions = await dadataSuggestByName(value)
        setNameSuggestions(suggestions)
        setNameDropdownOpen(suggestions.length > 0)
      }, 400)
    } else {
      setNameSuggestions([])
    }
  }

  // Закрыть dropdown по клику снаружи
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (nameContainerRef.current && !nameContainerRef.current.contains(e.target as Node)) {
        setNameDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

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
                          onChange={e => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
                          onPaste={e => {
                            e.preventDefault()
                            const pasted = e.clipboardData.getData("text")
                            const digits = pasted.replace(/\D/g, "").slice(0, 12)
                            setInn(digits)
                          }}
                          placeholder="7707083893"
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
                    <div className="space-y-1 relative" ref={nameContainerRef}>
                      <Label className="text-sm">Краткое название</Label>
                      <Input
                        value={shortName}
                        onChange={e => handleShortNameChange(e.target.value)}
                        placeholder='ООО «Ромашка»'
                        autoComplete="off"
                      />
                      {nameDropdownOpen && nameSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
                          {nameSuggestions.map(s => (
                            <button
                              key={s.inn}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); applyDadataResult(s) }}
                              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex flex-col gap-0.5"
                            >
                              <span className="text-sm font-medium text-foreground">{s.shortName}</span>
                              <span className="text-xs text-muted-foreground">ИНН {s.inn} · {s.legalAddress.split(",").slice(0, 2).join(", ")}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Полное название</Label>
                      <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder='ООО «РОМАШКА»' />
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
                          }}
                          className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                        />
                        <label htmlFor="postal-same" className="text-sm text-muted-foreground cursor-pointer select-none">
                          Совпадает с юридическим
                        </label>
                      </div>
                      {postalSameAsLegal ? (
                        <Input
                          value={legalAddress}
                          readOnly
                          className="bg-muted/50 text-muted-foreground cursor-default select-none"
                        />
                      ) : (
                        <Input
                          value={postalAddress}
                          onChange={e => setPostalAddress(e.target.value)}
                          placeholder="125009, г. Москва, ул. Тверская, д. 1"
                        />
                      )}
                    </div>
                    {/* Индекс и Город */}
                    <div className="space-y-1">
                      <Label className="text-sm">Почтовый индекс</Label>
                      <Input
                        value={postalIndex}
                        onChange={e => setPostalIndex(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="125009"
                        className="font-mono"
                        maxLength={6}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Город</Label>
                      <Input
                        value={postalCity}
                        onChange={e => setPostalCity(e.target.value)}
                        placeholder="Москва"
                      />
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
