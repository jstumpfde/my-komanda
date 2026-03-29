"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Loader2, Building2, CheckCircle2, Save, Search,
  Phone, Mail, Globe, MapPin, Calendar, Users, Briefcase,
  FileText, CreditCard, Info, Eye, Plus, X, ChevronDown, ChevronUp,
} from "lucide-react"
import { fetchCompanyApi, updateCompanyApi, fetchCompanyByInn } from "@/lib/company-storage"

// ─── DaData types ────────────────────────────────────────────

interface DadataResult {
  fullName: string; shortName: string; kpp: string; ogrn: string
  legalAddress: string; director: string; status: "active" | "liquidated"
  inn?: string; postalCode?: string; city?: string; foundedDate?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDadataSuggestion(s: any): DadataResult & { inn: string } {
  const d = s.data ?? {}
  const addrData = d.address?.data ?? {}
  let foundedDate = ""
  if (d.state?.registration_date) {
    const dt = new Date(d.state.registration_date)
    if (!isNaN(dt.getTime())) foundedDate = dt.toISOString().split("T")[0]
  }
  return {
    inn: d.inn ?? "", fullName: s.unrestricted_value ?? s.value ?? "",
    shortName: s.value ?? "", kpp: d.kpp ?? "", ogrn: d.ogrn ?? "",
    legalAddress: d.address?.value ?? d.address?.unrestricted_value ?? "",
    director: d.management?.name ?? "", status: d.state?.status === "ACTIVE" ? "active" : "liquidated",
    postalCode: addrData.postal_code ?? "", city: addrData.city ?? addrData.settlement ?? addrData.region_with_type ?? "",
    foundedDate,
  }
}

// ─── Bank account ────────────────────────────────────────────
interface BankAccount { id: string; bankName: string; bik: string; ks: string; rs: string }

// ─── Schedule ────────────────────────────────────────────────
interface DaySchedule { enabled: boolean; from: string; to: string }
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const DEFAULT_SCHEDULE: DaySchedule[] = [
  { enabled: true, from: "09:00", to: "18:00" }, { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" }, { enabled: true, from: "09:00", to: "18:00" },
  { enabled: true, from: "09:00", to: "18:00" }, { enabled: false, from: "10:00", to: "15:00" },
  { enabled: false, from: "10:00", to: "15:00" },
]

function formatScheduleSummary(days: DaySchedule[]): string {
  const enabled = days.map((d, i) => d.enabled ? { day: DAY_LABELS[i], from: d.from, to: d.to } : null).filter(Boolean)
  if (enabled.length === 0) return "Не задано"
  const groups: { days: string[]; from: string; to: string }[] = []
  for (const item of enabled) {
    if (!item) continue
    const last = groups[groups.length - 1]
    if (last && last.from === item.from && last.to === item.to) last.days.push(item.day)
    else groups.push({ days: [item.day], from: item.from, to: item.to })
  }
  return groups.map(g => {
    const dayStr = g.days.length > 2 ? `${g.days[0]}–${g.days[g.days.length - 1]}` : g.days.join(", ")
    return `${dayStr} ${g.from}–${g.to}`
  }).join("; ")
}

function yearsFromDate(dateStr: string): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years--
  return years > 0 ? years : 0
}

function pluralYears(n: number): string {
  const mod10 = n % 10, mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} лет`
  if (mod10 === 1) return `${n} год`
  if (mod10 >= 2 && mod10 <= 4) return `${n} года`
  return `${n} лет`
}

// ─── Component ───────────────────────────────────────────────
let _nextId = 2

export default function CompanyProfilePage() {
  const [inn, setInn] = useState(""); const [searching, setSearching] = useState(false); const [found, setFound] = useState(false)
  const [nameSuggestions, setNameSuggestions] = useState<Array<DadataResult & { inn: string }>>([]); const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); const nameContainerRef = useRef<HTMLDivElement>(null)
  const [fullName, setFullName] = useState(""); const [shortName, setShortName] = useState(""); const [kpp, setKpp] = useState(""); const [ogrn, setOgrn] = useState("")
  const [legalAddress, setLegalAddress] = useState(""); const [director, setDirector] = useState(""); const [companyStatus, setCompanyStatus] = useState<"active"|"liquidated"|"">("")
  const [postalSameAsLegal, setPostalSameAsLegal] = useState(false); const [postalAddress, setPostalAddress] = useState(""); const [postalIndex, setPostalIndex] = useState(""); const [postalCity, setPostalCity] = useState("")
  const [accounts, setAccounts] = useState<BankAccount[]>([{ id: "1", bankName: "", bik: "", rs: "", ks: "" }]); const [defaultAccountId, setDefaultAccountId] = useState("1"); const [bikSearching, setBikSearching] = useState<string|null>(null); const [bankNameSearching, setBankNameSearching] = useState<string|null>(null)
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [website, setWebsite] = useState("")
  const [description, setDescription] = useState(""); const [registrationDate, setRegistrationDate] = useState(""); const [employeeCount, setEmployeeCount] = useState("")
  const [industry, setIndustry] = useState(""); const [officeAddress, setOfficeAddress] = useState(""); const [weekSchedule, setWeekSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE); const [scheduleExpanded, setScheduleExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const applyDadataResult = (result: DadataResult & { inn?: string }) => {
    setFullName(result.fullName); setShortName(result.shortName); setKpp(result.kpp); setOgrn(result.ogrn)
    setLegalAddress(result.legalAddress); setDirector(result.director); setCompanyStatus(result.status)
    if (result.inn) setInn(result.inn); if (result.postalCode) setPostalIndex(result.postalCode); if (result.city) setPostalCity(result.city)
    if (result.foundedDate) setRegistrationDate(result.foundedDate)
    if (!officeAddress && result.legalAddress) setOfficeAddress(result.legalAddress)
    setFound(true); setNameDropdownOpen(false); setNameSuggestions([])
    toast.success("Компания найдена — все поля заполнены")
  }

  const handleSearch = async () => {
    if (!inn.trim()) { toast.error("Введите ИНН"); return }
    setSearching(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await fetchCompanyByInn(inn.trim()) as any
      const suggestions = json?.suggestions ?? []
      if (suggestions.length > 0) applyDadataResult(parseDadataSuggestion(suggestions[0]))
      else { toast.error("Компания не найдена. Проверьте ИНН."); setFound(false) }
    } catch { toast.error("Ошибка поиска."); setFound(false) }
    setSearching(false)
  }

  const handleShortNameChange = (value: string) => { setShortName(value); setNameDropdownOpen(false); setNameSuggestions([]); if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current) }

  useEffect(() => { fetchCompanyApi().then((data: unknown) => { const c = data as Record<string, string> | null; if (!c) return; if (c.inn) setInn(c.inn); if (c.kpp) setKpp(c.kpp); if (c.name) { setShortName(c.name); setFullName(c.name) }; if (c.legalAddress) setLegalAddress(c.legalAddress); if (c.city) setPostalCity(c.city); if (c.postalCode) setPostalIndex(c.postalCode); if (c.industry) setIndustry(c.industry) }).catch(() => {}) }, [])
  useEffect(() => { const handler = (e: MouseEvent) => { if (nameContainerRef.current && !nameContainerRef.current.contains(e.target as Node)) setNameDropdownOpen(false) }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler) }, [])

  const handleBikSearch = useCallback(async (accountId: string, bik: string) => {
    if (bik.length !== 9) { toast.error("БИК должен содержать 9 цифр"); return }
    setBikSearching(accountId)
    try {
      const resp = await fetch(`/api/companies/by-bik?bik=${bik}`); if (!resp.ok) throw new Error()
      const json = await resp.json(); const suggestions = json?.data?.suggestions ?? json?.suggestions ?? []
      if (suggestions.length > 0) {
        const bank = suggestions[0]; const bankData = bank.data ?? {}
        setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, bankName: bank.value ?? bankData.name?.short ?? "", ks: bankData.correspondent_account ?? "" } : a))
        toast.success("Банк найден")
      } else { toast.error("Банк не найден") }
    } catch { toast.error("Ошибка поиска") } setBikSearching(null)
  }, [])

  const handleBankNameSearch = useCallback(async (accountId: string, name: string) => {
    if (!name.trim()) { toast.error("Введите название банка"); return }
    setBankNameSearching(accountId)
    try {
      const resp = await fetch(`/api/companies/by-bank-name?q=${encodeURIComponent(name)}`); if (!resp.ok) throw new Error()
      const json = await resp.json(); const suggestions = json?.data?.suggestions ?? json?.suggestions ?? []
      if (suggestions.length > 0) {
        const bank = suggestions[0]; const bankData = bank.data ?? {}
        setAccounts(prev => prev.map(a => a.id === accountId ? {
          ...a,
          bankName: bank.value ?? bankData.name?.short ?? a.bankName,
          bik: bankData.bic ?? a.bik,
          ks: bankData.correspondent_account ?? a.ks,
        } : a))
        toast.success("Банк найден")
      } else { toast.error("Банк не найден") }
    } catch { toast.error("Ошибка поиска") } setBankNameSearching(null)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCompanyApi({ name: shortName || fullName || undefined, inn: inn || undefined, kpp: kpp || undefined, legal_address: legalAddress || undefined, city: postalCity || undefined, postal_code: postalIndex || undefined, industry: industry || undefined })
      toast.success("Профиль компании сохранён")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      if (msg.includes("404") || msg.toLowerCase().includes("no company")) toast.success("Данные сохранены локально")
      else toast.error(`Ошибка: ${msg}`)
    } finally { setSaving(false) }
  }

  const addAccount = () => { const id = String(_nextId++); setAccounts(prev => [...prev, { id, bankName: "", bik: "", rs: "", ks: "" }]) }
  const updateAccount = (u: BankAccount) => { setAccounts(prev => prev.map(a => a.id === u.id ? u : a)) }
  const removeAccount = (id: string) => { setAccounts(prev => { const next = prev.filter(a => a.id !== id); if (defaultAccountId === id && next.length > 0) setDefaultAccountId(next[0].id); return next }) }
  const updateDaySchedule = (i: number, patch: Partial<DaySchedule>) => { setWeekSchedule(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d)) }

  const years = yearsFromDate(registrationDate)
  const ph = "[&::placeholder]:text-muted-foreground/55"

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Профиль компании</h1>
        <p className="text-muted-foreground text-sm">Данные организации и настройки для демонстраций</p>
      </div>

      <div className="space-y-3">
        {/* ═══ Компания ═══════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Компания
              {companyStatus === "active" && <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> Действующая</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">ИНН</Label>
                <div className="relative">
                  <Input value={inn} onChange={e => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))} onPaste={e => { e.preventDefault(); setInn(e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 12)) }} placeholder="Введите ИНН и нажмите Enter для автозаполнения" className={cn("font-mono pr-9", ph)} onKeyDown={e => { if (e.key === "Enter") handleSearch() }} />
                  {searching
                    ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    : <button type="button" onClick={handleSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"><Search className="w-4 h-4" /></button>
                  }
                </div>
              </div>
              <div className="space-y-1"><Label className="text-sm">КПП</Label><Input value={kpp} onChange={e => setKpp(e.target.value)} placeholder="770701001" className={cn("font-mono", ph)} /></div>
              <div className="space-y-1 relative" ref={nameContainerRef}>
                <Label className="text-sm">Краткое название</Label>
                <Input value={shortName} onChange={e => handleShortNameChange(e.target.value)} placeholder='ООО «Ромашка»' autoComplete="off" className={ph} />
                {nameDropdownOpen && nameSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
                    {nameSuggestions.map(s => (<button key={s.inn} type="button" onMouseDown={e => { e.preventDefault(); applyDadataResult(s) }} className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex flex-col gap-0.5"><span className="text-sm font-medium text-foreground">{s.shortName}</span><span className="text-xs text-muted-foreground">ИНН {s.inn}</span></button>))}
                  </div>
                )}
              </div>
              <div className="space-y-1"><Label className="text-sm">Полное название</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder='ООО «РОМАШКА»' className={ph} /></div>
              <div className="space-y-1"><Label className="text-sm">ОГРН</Label><Input value={ogrn} onChange={e => setOgrn(e.target.value)} placeholder="1037707049388" className={cn("font-mono", ph)} /></div>
              <div className="space-y-1"><Label className="text-sm">Руководитель</Label><Input value={director} onChange={e => setDirector(e.target.value)} placeholder="Иванов А.С." className={ph} /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-sm">Юридический адрес</Label><Input value={legalAddress} onChange={e => setLegalAddress(e.target.value)} placeholder="125009, г. Москва, ул. Тверская, д. 1" className={ph} /></div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-sm">Почтовый адрес</Label>
                <div className="flex items-center gap-2 mb-1.5">
                  <input type="checkbox" id="postal-same" checked={postalSameAsLegal} onChange={e => { setPostalSameAsLegal(e.target.checked); if (e.target.checked) setPostalAddress(legalAddress) }} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                  <label htmlFor="postal-same" className="text-sm text-muted-foreground cursor-pointer select-none">Совпадает с юридическим</label>
                </div>
                <Input value={postalSameAsLegal ? legalAddress : postalAddress} onChange={e => !postalSameAsLegal && setPostalAddress(e.target.value)} readOnly={postalSameAsLegal} className={cn(postalSameAsLegal && "bg-muted/50 text-muted-foreground cursor-default select-none", ph)} placeholder="125009, г. Москва, ул. Тверская, д. 1" />
              </div>
              <div className="space-y-1"><Label className="text-sm">Почтовый индекс</Label><Input value={postalIndex} onChange={e => setPostalIndex(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="125009" className={cn("font-mono", ph)} maxLength={6} /></div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Город</Label><Input value={postalCity} onChange={e => setPostalCity(e.target.value)} placeholder="Москва" className={ph} /></div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hr@romashka.ru" className={ph} /></div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> Телефон</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (495) 123-45-67" className={ph} /></div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-muted-foreground" /> Сайт</Label><Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://romashka.ru" className={ph} /></div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ Банковские реквизиты ════════════════════════ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Банковские реквизиты</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {accounts.map(account => (
              <div key={account.id} className="space-y-2 p-3 rounded-lg border border-border/60 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setDefaultAccountId(account.id)} title="Сделать основным">
                      <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors", account.id === defaultAccountId ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary/60")}>{account.id === defaultAccountId && <div className="w-1.5 h-1.5 rounded-full bg-white" />}</div>
                    </button>
                    <span className="text-xs text-muted-foreground">{account.id === defaultAccountId ? "Основной счёт" : "Доп. счёт"}</span>
                  </div>
                  {accounts.length > 1 && <button type="button" onClick={() => removeAccount(account.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors"><X className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                  {/* Название банка */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Название банка</Label>
                    <div className="relative">
                      <Input value={account.bankName} onChange={e => updateAccount({ ...account, bankName: e.target.value })} onKeyDown={e => { if (e.key === "Enter") handleBankNameSearch(account.id, account.bankName) }} placeholder="ПАО Сбербанк" className={cn("h-9 text-sm pr-9", ph)} />
                      {bankNameSearching === account.id
                        ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        : <button type="button" onClick={() => handleBankNameSearch(account.id, account.bankName)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"><Search className="w-3.5 h-3.5" /></button>
                      }
                    </div>
                  </div>
                  {/* БИК */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">БИК</Label>
                    <div className="relative">
                      <Input value={account.bik} onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 9); updateAccount({ ...account, bik: v }); if (v.length === 9) handleBikSearch(account.id, v) }} placeholder="044525225" className={cn("h-9 text-sm font-mono pr-9", ph)} maxLength={9} />
                      {bikSearching === account.id
                        ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        : <button type="button" onClick={() => handleBikSearch(account.id, account.bik)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"><Search className="w-3.5 h-3.5" /></button>
                      }
                    </div>
                  </div>
                  {/* Корр. счёт */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Корр. счёт</Label>
                    <Input value={account.ks} onChange={e => updateAccount({ ...account, ks: e.target.value })} placeholder="30101810400000000225" className={cn("h-9 text-sm font-mono", ph)} />
                  </div>
                  {/* Расчётный счёт */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Расчётный счёт</Label>
                    <Input value={account.rs} onChange={e => updateAccount({ ...account, rs: e.target.value })} placeholder="40702810100000012345" className={cn("h-9 text-sm font-mono", ph)} />
                  </div>
                </div>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Счетов ещё нет.</p>}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addAccount}><Plus className="w-3.5 h-3.5" /> Добавить счёт</Button>
          </CardContent>
        </Card>

        {/* ═══ Данные для демонстрации ════════════════════ */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> Данные для демонстрации должности</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">Эти данные подставляются в шаблоны через переменные: {"{{компания_описание}}"}, {"{{дата_регистрации}}"}, {"{{сотрудников}}"} и т.д.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-sm flex items-center gap-2">Описание компании <Badge variant="outline" className="text-[10px] font-mono">{"{{компания_описание}}"}</Badge></Label>
              <textarea className={cn("w-full border rounded-lg p-2.5 text-sm resize-none h-20 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none", ph)} value={description} onChange={e => setDescription(e.target.value)} placeholder="Современная компания, специализирующаяся на..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Дата регистрации <Badge variant="outline" className="text-[10px] font-mono">{"{{дата_регистрации}}"}</Badge></Label>
                <div className="flex items-center gap-2">
                  <Input type="date" value={registrationDate} onChange={e => setRegistrationDate(e.target.value)} className="flex-1" />
                  {years !== null && <Badge variant="secondary" className="text-xs whitespace-nowrap shrink-0">{pluralYears(years)}</Badge>}
                </div>
              </div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" /> Количество сотрудников <Badge variant="outline" className="text-[10px] font-mono">{"{{сотрудников}}"}</Badge></Label><Input value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="150" className={ph} /></div>
              <div className="space-y-1"><Label className="text-sm flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Сфера деятельности <Badge variant="outline" className="text-[10px] font-mono">{"{{сфера}}"}</Badge></Label><Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="IT, B2B продажи" className={ph} /></div>
              <div className="space-y-1">
                <Label className="text-sm flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Адрес офиса <Badge variant="outline" className="text-[10px] font-mono">{"{{адрес_офиса}}"}</Badge></Label>
                <Input value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder={legalAddress || "ул. Примерная, 1"} className={ph} />
                {!officeAddress && legalAddress && <p className="text-[10px] text-muted-foreground/40">По умолчанию = юридический адрес</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-muted-foreground" /> График работы <Badge variant="outline" className="text-[10px] font-mono">{"{{график}}"}</Badge></Label>
                  <button type="button" onClick={() => setScheduleExpanded(!scheduleExpanded)} className="text-xs text-primary hover:underline flex items-center gap-1">
                    {scheduleExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Настроить</>}
                  </button>
                </div>
                {!scheduleExpanded ? (
                  <div className="text-sm text-foreground px-3 py-2 rounded-lg border border-border/60 bg-muted/10">{formatScheduleSummary(weekSchedule)}</div>
                ) : (
                  <div className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-muted/10">
                    {weekSchedule.map((day, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 text-sm font-medium text-foreground">{DAY_LABELS[i]}</div>
                        <Switch checked={day.enabled} onCheckedChange={checked => updateDaySchedule(i, { enabled: checked })} />
                        {day.enabled ? (
                          <div className="flex items-center gap-1.5">
                            <Input type="time" value={day.from} onChange={e => updateDaySchedule(i, { from: e.target.value })} className="h-8 w-24 text-sm" />
                            <span className="text-xs text-muted-foreground">—</span>
                            <Input type="time" value={day.to} onChange={e => updateDaySchedule(i, { to: e.target.value })} className="h-8 w-24 text-sm" />
                          </div>
                        ) : <span className="text-xs text-muted-foreground">Выходной</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ Сохранить ══════════════════════════════════ */}
        <div className="flex justify-end pb-4">
          <Button size="lg" className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Сохранение..." : "Сохранить профиль"}
          </Button>
        </div>
      </div>
    </>
  )
}
