"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { DEFAULT_TARIFFS, formatPrice, type Tariff } from "@/lib/tariff-types"
import { getCompany } from "@/lib/company-storage"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  CreditCard, Smartphone, Building2, FileText, Check, X,
  Crown, Sparkles, Receipt, Clock, Tag, Download, ExternalLink, Filter,
} from "lucide-react"
import type QRCodeType from "qrcode"

const PROMO_CODES: Record<string, number> = {
  "WELCOME10": 10,
  "SAVE20": 20,
  "HR2026": 15,
}

// Конфиг слайдера: сколько доп. вакансий можно добавить
const SLIDER_MAX: Record<string, number> = {
  solo: 1,      // до 2 вакансий
  starter: 6,   // до 9 вакансий
  business: 11, // до 21 вакансии
  pro: 25,      // до 50 вакансий
}
const EXTRA_VAC_PRICE = 4000  // ₽/мес за доп. вакансию
const CANDS_PER_VAC = 400     // кандидатов на вакансию

// Текущий тариф клиента (захардкожен)
const currentTariffId = "business"
const usage = { vacancies: 7, candidates: 847 }
const nextBilling = new Date(2026, 3, 1)

const REQUISITES = {
  name: "ИП ШТУМПФ ЮРИЙ ГЕННАДЬЕВИЧ",
  inn: "550615955642",
  bankAccount: "40802810402720001811",
  bankName: 'АО «АЛЬФА-БАНК»',
  bik: "044525593",
  corrAccount: "30101810200000000593",
}

const PERIODS = [
  { label: "1 мес", months: 1, discount: 0 },
  { label: "3 мес", months: 3, discount: 5 },
  { label: "6 мес", months: 6, discount: 10 },
  { label: "12 мес", months: 12, discount: 20 },
]

const DEMO_DOCS: { id: string; type: "Счёт" | "Акт"; number: string; date: string; period: string; amount: number; status: string }[] = [
  { id: "d1", type: "Счёт",  number: "С-003/2026", date: "01.03.2026", period: "март 2026",    amount: 49900, status: "Выставлен" },
  { id: "d2", type: "Акт",   number: "А-002/2026", date: "05.03.2026", period: "февраль 2026", amount: 49900, status: "Подписан"  },
  { id: "d3", type: "Счёт",  number: "С-002/2026", date: "01.02.2026", period: "февраль 2026", amount: 49900, status: "Оплачен"   },
  { id: "d4", type: "Акт",   number: "А-001/2026", date: "04.02.2026", period: "январь 2026",  amount: 49900, status: "Подписан"  },
  { id: "d5", type: "Счёт",  number: "С-001/2026", date: "01.01.2026", period: "январь 2026",  amount: 49900, status: "Оплачен"   },
  { id: "d6", type: "Счёт",  number: "С-012/2025", date: "01.12.2025", period: "декабрь 2025", amount: 19900, status: "Оплачен"   },
]

function printPdf(title: string, content: string) {
  const w = window.open("", "_blank", "width=800,height=900")
  if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;font-size:13px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:6px 10px;border:1px solid #ccc;text-align:left}th{background:#f0f0f0}@media print{button{display:none}}</style>
    </head><body>${content}<br><button onclick="window.print()">Распечатать / Сохранить PDF</button></body></html>`)
  w.document.close()
}

function InvoiceModal({
  open,
  onClose,
  tariff,
}: {
  open: boolean
  onClose: () => void
  tariff: Tariff
}) {
  const [periodIdx, setPeriodIdx] = useState(0)
  const [companyName, setCompanyName] = useState(() => getCompany()?.name ?? "")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const period = PERIODS[periodIdx]
  const baseAmount = tariff.price * period.months
  const discountAmount = Math.round(baseAmount * period.discount / 100)
  const totalAmount = baseAmount - discountAmount

  const qrText = `Оплата тарифа ${tariff.name} за ${period.label}, сумма ${totalAmount.toLocaleString("ru-RU")} руб., ИП Штумпф Ю.Г., ИНН ${REQUISITES.inn}`

  useEffect(() => {
    if (!open || !canvasRef.current) return
    import("qrcode").then((QRCode: { default: typeof QRCodeType }) => {
      QRCode.default.toCanvas(canvasRef.current!, qrText, { width: 160, margin: 1 }, (err: Error | null) => {
        if (err) console.error(err)
      })
    })
  }, [open, qrText])

  const handlePdf = () => {
    const num = `С-${String(new Date().getMonth() + 1).padStart(3,"0")}/${new Date().getFullYear()}`
    const payer = companyName || "—"
    printPdf(`Счёт ${num}`, `
      <h2>Счёт на оплату № ${num} от ${new Date().toLocaleDateString("ru-RU")}</h2>
      <table>
        <tr><th>Получатель</th><td>${REQUISITES.name}</td></tr>
        <tr><th>ИНН</th><td>${REQUISITES.inn}</td></tr>
        <tr><th>Расчётный счёт</th><td>${REQUISITES.bankAccount}</td></tr>
        <tr><th>Банк</th><td>${REQUISITES.bankName}</td></tr>
        <tr><th>БИК</th><td>${REQUISITES.bik}</td></tr>
        <tr><th>Корр. счёт</th><td>${REQUISITES.corrAccount}</td></tr>
        <tr><th>Плательщик</th><td>${payer}</td></tr>
      </table>
      <table style="margin-top:20px">
        <tr><th>Услуга</th><th>Период</th><th>Сумма</th></tr>
        <tr><td>Тариф ${tariff.name}</td><td>${period.label}</td><td>${baseAmount.toLocaleString("ru-RU")} ₽</td></tr>
        ${period.discount > 0 ? `<tr><td colspan="2">Скидка ${period.discount}%</td><td>−${discountAmount.toLocaleString("ru-RU")} ₽</td></tr>` : ""}
        <tr><td colspan="2"><b>Итого к оплате</b></td><td><b>${totalAmount.toLocaleString("ru-RU")} ₽</b></td></tr>
      </table>
    `)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Выставить счёт</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Плательщик */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Плательщик (компания)</Label>
            <Input
              placeholder="ООО Ромашка"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>

          {/* Период */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Период оплаты</Label>
            <div className="grid grid-cols-2 gap-2">
              {PERIODS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPeriodIdx(i)}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                    periodIdx === i
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  {p.discount > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">−{p.discount}%</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Сумма */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Тариф {tariff.name} × {period.months} мес.</span>
              <span>{baseAmount.toLocaleString("ru-RU")} ₽</span>
            </div>
            {period.discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Скидка {period.discount}%</span>
                <span>−{discountAmount.toLocaleString("ru-RU")} ₽</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Итого</span>
              <span>{totalAmount.toLocaleString("ru-RU")} ₽</span>
            </div>
          </div>

          {/* Реквизиты */}
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-foreground">Реквизиты получателя</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Получатель</span>
              <span className="font-medium">{REQUISITES.name}</span>
              <span className="text-muted-foreground">ИНН</span>
              <span>{REQUISITES.inn}</span>
              <span className="text-muted-foreground">Р/с</span>
              <span className="font-mono text-xs">{REQUISITES.bankAccount}</span>
              <span className="text-muted-foreground">Банк</span>
              <span>{REQUISITES.bankName}</span>
              <span className="text-muted-foreground">БИК</span>
              <span className="font-mono text-xs">{REQUISITES.bik}</span>
              <span className="text-muted-foreground">Корр. счёт</span>
              <span className="font-mono text-xs">{REQUISITES.corrAccount}</span>
            </div>
          </div>

          {/* QR-код */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">QR-код для оплаты</p>
            <canvas ref={canvasRef} className="rounded-lg border" />
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            <Button className="flex-1 gap-1.5" onClick={handlePdf}>
              <Download className="w-4 h-4" />
              Скачать PDF
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActModal({
  open,
  onClose,
  tariff,
}: {
  open: boolean
  onClose: () => void
  tariff: Tariff
}) {
  const now = new Date()
  const months = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
  const [month, setMonth] = useState(String(now.getMonth()))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [companyName, setCompanyName] = useState(() => getCompany()?.name ?? "")
  const amount = tariff.price

  const handlePdf = () => {
    const num = `А-${String(parseInt(month)+1).padStart(3,"0")}/${year}`
    const periodLabel = `${months[parseInt(month)]} ${year}`
    const payer = companyName || "—"
    printPdf(`Акт ${num}`, `
      <h2>Акт об оказании услуг № ${num} от ${new Date().toLocaleDateString("ru-RU")}</h2>
      <p><b>Исполнитель:</b> ${REQUISITES.name}, ИНН ${REQUISITES.inn}</p>
      <p><b>Заказчик:</b> ${payer}</p>
      <p><b>Период:</b> ${periodLabel}</p>
      <table style="margin-top:16px">
        <tr><th>№</th><th>Услуга</th><th>Период</th><th>Сумма</th></tr>
        <tr><td>1</td><td>Лицензия на использование сервиса my-komanda, тариф ${tariff.name}</td><td>${periodLabel}</td><td>${amount.toLocaleString("ru-RU")} ₽</td></tr>
        <tr><td colspan="3"><b>Итого</b></td><td><b>${amount.toLocaleString("ru-RU")} ₽</b></td></tr>
      </table>
      <p style="margin-top:20px">Услуги оказаны в полном объёме. Претензий со стороны заказчика не поступало.</p>
    `)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Акт об оказании услуг</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Компания */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Заказчик (компания)</Label>
            <Input
              placeholder="ООО Ромашка"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>

          {/* Период */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Период</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["2024","2025","2026"].map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Сумма */}
          <div className="p-4 rounded-lg bg-muted/50">
            <div className="flex justify-between font-semibold">
              <span>Тариф {tariff.name}</span>
              <span>{amount.toLocaleString("ru-RU")} ₽</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{months[parseInt(month)]} {year}</p>
          </div>

          {/* Исполнитель */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground text-sm">Исполнитель</p>
            <p>{REQUISITES.name}</p>
            <p>ИНН {REQUISITES.inn}</p>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 gap-1.5" onClick={handlePdf}>
              <Download className="w-4 h-4" />
              Скачать PDF
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function BillingPage() {
  const [tariffs] = useState<Tariff[]>(DEFAULT_TARIFFS)
  const [activeTariff, setActiveTariff] = useState(currentTariffId)
  const [showPayment, setShowPayment] = useState(false)
  const [pendingTariff, setPendingTariff] = useState<Tariff | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showAct, setShowAct] = useState(false)
  const [docTypeFilter, setDocTypeFilter] = useState("all")
  const [docPeriodFilter, setDocPeriodFilter] = useState("all")
  const [cardPeriods, setCardPeriods] = useState<Record<string, number>>({})
  const [extraVacancies, setExtraVacancies] = useState<Record<string, number>>({})
  const [promoCode, setPromoCode] = useState("")
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [promoApplied, setPromoApplied] = useState(false)

  const current = tariffs.find(t => t.id === activeTariff)!

  const getCardPeriodIdx = (tariffId: string) => cardPeriods[tariffId] ?? 0
  const setCardPeriodIdx = (tariffId: string, idx: number) =>
    setCardPeriods(prev => ({ ...prev, [tariffId]: idx }))

  const getExtraVacancies = (tariffId: string) => extraVacancies[tariffId] ?? 0

  const applyPromo = () => {
    const discount = PROMO_CODES[promoCode.toUpperCase()]
    if (discount) {
      setPromoDiscount(discount)
      setPromoApplied(true)
      toast.success(`Промокод применён: −${discount}%`)
    } else {
      toast.error("Промокод не найден")
    }
  }

  const handleSelectTariff = (tariff: Tariff) => {
    if (tariff.id === activeTariff) return
    setPendingTariff(tariff)
    setShowPayment(true)
  }

  const confirmPayment = () => {
    if (pendingTariff) {
      setActiveTariff(pendingTariff.id)
      toast.success(`Тариф изменён на ${pendingTariff.name}`)
    }
    setShowPayment(false)
    setPendingTariff(null)
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Тариф и оплата</h1>
        <p className="text-muted-foreground text-sm">Управление подпиской и документами</p>
      </div>

      {/* ═══ Текущий тариф ═══════════════════════════════ */}
      <Card className="mb-8 border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-primary" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">Тариф: {current.name}</h2>
                    <Badge className="bg-primary text-primary-foreground">{formatPrice(current.price)}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Вакансии</span>
                    <span className="font-medium">{usage.vacancies} из {current.maxVacancies === 999 ? "∞" : current.maxVacancies}</span>
                  </div>
                  <Progress value={(usage.vacancies / current.maxVacancies) * 100} className="h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Кандидаты</span>
                    <span className="font-medium">{usage.candidates.toLocaleString("ru-RU")} из {current.maxCandidates.toLocaleString("ru-RU")}</span>
                  </div>
                  <Progress value={(usage.candidates / current.maxCandidates) * 100} className="h-2" />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                Следующее списание: {nextBilling.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => document.getElementById("tariff-cards")?.scrollIntoView({ behavior: "smooth" })}>
                Изменить тариф
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowHistory(true)}>
                <Receipt className="w-3.5 h-3.5" />
                История платежей
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Промокод ════════════════════════════════════ */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-3">Промокод</h3>
        <div className="flex gap-2 max-w-sm">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(false); setPromoDiscount(0) }}
              placeholder="Введите промокод"
              className="pl-9 uppercase font-mono"
              disabled={promoApplied}
            />
          </div>
          <Button
            variant={promoApplied ? "outline" : "default"}
            onClick={promoApplied ? () => { setPromoApplied(false); setPromoDiscount(0); setPromoCode("") } : applyPromo}
            className={promoApplied ? "text-emerald-600 border-emerald-300" : ""}
          >
            {promoApplied ? `−${promoDiscount}% ✕` : "Применить"}
          </Button>
        </div>
        {promoApplied && (
          <p className="text-xs text-emerald-600 mt-1.5 font-medium">Скидка {promoDiscount}% применена ко всем тарифам</p>
        )}
      </div>

      {/* ═══ Выбор тарифа ════════════════════════════════ */}
      <div id="tariff-cards" className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Выбор тарифа</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tariffs.map(tariff => {
            const isCurrent = tariff.id === activeTariff
            const features = getTariffFeatures(tariff)
            const periodIdx = getCardPeriodIdx(tariff.id)
            const period = PERIODS[periodIdx]
            const extra = getExtraVacancies(tariff.id)
            const totalVacancies = tariff.maxVacancies === 999 ? 999 : tariff.maxVacancies + extra
            const totalCandidates = tariff.maxVacancies === 999 ? tariff.maxCandidates : (tariff.maxVacancies + extra) * CANDS_PER_VAC
            const extraMonthly = extra * EXTRA_VAC_PRICE
            const baseMonthly = tariff.price + extraMonthly
            const baseAmount = baseMonthly * period.months
            const discountAmount = Math.round(baseAmount * (period.discount + promoDiscount) / 100)
            const totalAmount = baseAmount - discountAmount
            return (
              <Card
                key={tariff.id}
                className={cn(
                  "relative transition-all",
                  isCurrent && "ring-2 ring-primary border-primary",
                  tariff.badge && "border-primary/30"
                )}
              >
                {tariff.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={tariff.badgeColor || "bg-primary text-primary-foreground"}>
                      <Sparkles className="w-3 h-3 mr-1" />
                      {tariff.badge}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-5 pt-6 flex flex-col h-full">
                  {/* Название и цена */}
                  <div className="text-center mb-3">
                    <h4 className="text-lg font-bold text-foreground">{tariff.name}</h4>
                    <div className="mt-1">
                      <span className="text-2xl font-bold text-foreground">{baseMonthly.toLocaleString("ru-RU")}</span>
                      <span className="text-sm text-muted-foreground"> ₽/мес</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        До {totalCandidates === 999 ? "∞" : totalCandidates.toLocaleString("ru-RU")} кандидатов
                      </p>
                      {(period.discount > 0 || promoDiscount > 0) && (
                        <p className="text-xs text-emerald-600 font-medium mt-0.5">
                          Итого: {totalAmount.toLocaleString("ru-RU")} ₽ (−{discountAmount.toLocaleString("ru-RU")} ₽)
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator className="mb-3" />

                  {/* Слайдер вакансий */}
                  {tariff.maxVacancies !== 999 ? (
                    <div className="mb-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">Вакансии</span>
                        <span className="text-xs font-bold text-foreground">{totalVacancies}</span>
                      </div>
                      <Slider
                        min={0} max={SLIDER_MAX[tariff.id] ?? 10} step={1}
                        value={[extra]}
                        onValueChange={([v]) => setExtraVacancies(prev => ({ ...prev, [tariff.id]: v }))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{tariff.maxVacancies} включено</span>
                        <span>+{extra} доп. × {EXTRA_VAC_PRICE.toLocaleString("ru-RU")} ₽</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Вакансии</span>
                      <span className="text-xs font-bold text-foreground">без лимита</span>
                    </div>
                  )}

                  <Separator className="mb-3" />

                  {/* Фичи */}
                  <div className="space-y-2 mb-4 flex-1">
                    {features.filter(f => f.included).map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="text-xs text-foreground">{f.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Выбор периода */}
                  {tariff.price > 0 && (
                    <div className="flex gap-1 mb-3">
                      {PERIODS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => setCardPeriodIdx(tariff.id, i)}
                          className={cn(
                            "flex-1 text-[10px] py-1 rounded border transition-all font-medium",
                            periodIdx === i
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          {p.label}
                          {p.discount > 0 && <span className="block text-[9px] leading-none opacity-80">−{p.discount}%</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Кнопка */}
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Текущий тариф
                    </Button>
                  ) : (
                    <Button
                      className={cn("w-full", tariff.badge && "bg-primary hover:bg-primary/90")}
                      variant={tariff.badge ? "default" : "outline"}
                      onClick={() => handleSelectTariff(tariff)}
                    >
                      {tariff.price === 0 ? "Начать Trial" : "Выбрать"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ═══ Способы оплаты ══════════════════════════════ */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Способы оплаты</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Расчётный счёт — активен */}
          <button className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 text-left cursor-default" disabled>
            <Building2 className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Расчётный счёт</p>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="text-xs text-muted-foreground">Для юридических лиц</p>
            </div>
          </button>
          {/* СБП — скоро */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border bg-muted/20 opacity-60">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">СБП — без комиссии</p>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">скоро</span>
              </div>
              <p className="text-xs text-muted-foreground">Моментальное зачисление</p>
            </div>
          </div>
          {/* Карта — скоро */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-border bg-muted/20 opacity-60">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Карта (ЮKassa)</p>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">скоро</span>
              </div>
              <p className="text-xs text-muted-foreground">Visa, MasterCard, МИР</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Документы ════════════════════════════════════ */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Документы</h3>

        {/* Действия */}
        <div className="flex flex-wrap gap-2 mb-6">
          <a href="/oferta" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Договор-оферта
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </Button>
          </a>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInvoice(true)}>
            <Receipt className="w-3.5 h-3.5" />
            Счёт
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAct(true)}>
            <FileText className="w-3.5 h-3.5" />
            Акт
          </Button>
        </div>

        {/* Таблица документов */}
        <div className="space-y-3">
          {/* Фильтры */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="Счёт">Счёт</SelectItem>
                <SelectItem value="Акт">Акт</SelectItem>
              </SelectContent>
            </Select>
            <Select value={docPeriodFilter} onValueChange={setDocPeriodFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Весь период</SelectItem>
                <SelectItem value="2026">2026 год</SelectItem>
                <SelectItem value="2025">2025 год</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Список */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Документ</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Период</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Дата</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Сумма</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-2.5">Статус</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {DEMO_DOCS
                  .filter(d => docTypeFilter === "all" || d.type === docTypeFilter)
                  .filter(d => docPeriodFilter === "all" || d.date.endsWith(docPeriodFilter))
                  .map(doc => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {doc.type === "Счёт" ? <Receipt className="w-4 h-4 text-muted-foreground shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <div>
                            <p className="font-medium text-foreground">{doc.type}</p>
                            <p className="text-xs text-muted-foreground">{doc.number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{doc.period}</td>
                      <td className="px-4 py-3 text-muted-foreground">{doc.date}</td>
                      <td className="px-4 py-3 text-right font-medium">{doc.amount.toLocaleString("ru-RU")} ₽</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={cn("text-xs",
                          doc.status === "Оплачен" || doc.status === "Подписан"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                        )}>
                          {doc.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info(`Скачать ${doc.number}`)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Диалог оплаты */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Подтверждение</DialogTitle>
          </DialogHeader>
          {pendingTariff && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-foreground">
                Переход на тариф <span className="font-bold">{pendingTariff.name}</span> — {formatPrice(pendingTariff.price)}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={confirmPayment}>Подтвердить</Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowPayment(false)}>Отмена</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог истории платежей */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>История платежей</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {[
              { date: "01.03.2026", amount: 49900, status: "Оплачен", method: "Карта •••• 4242" },
              { date: "01.02.2026", amount: 49900, status: "Оплачен", method: "Карта •••• 4242" },
              { date: "01.01.2026", amount: 49900, status: "Оплачен", method: "СБП" },
              { date: "01.12.2025", amount: 19900, status: "Оплачен", method: "Расч. счёт" },
            ].map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                <div>
                  <span className="font-medium text-foreground">{p.date}</span>
                  <span className="text-muted-foreground ml-2">{p.method}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.amount.toLocaleString("ru-RU")} ₽</span>
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200">
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог счёта */}
      <InvoiceModal
        open={showInvoice}
        onClose={() => setShowInvoice(false)}
        tariff={current}
      />

      {/* Диалог акта */}
      <ActModal
        open={showAct}
        onClose={() => setShowAct(false)}
        tariff={current}
      />
    </>
  )
}

function getTariffFeatures(tariff: Tariff): { label: string; included: boolean }[] {
  const v = tariff.maxVacancies === 999 ? "Безлимит" : `До ${tariff.maxVacancies}`
  return [
    { label: `${v} вакансий`, included: true },
    { label: `До ${tariff.maxCandidates.toLocaleString("ru-RU")} кандидатов`, included: true },
    { label: "Все базовые функции", included: true },
    { label: "Полный брендинг (логотип + цвета)", included: true },
    { label: "Имя AI-рекрутера", included: true },
    { label: "Кастомный домен", included: true },
    { label: "API доступ", included: true },
    { label: "Приоритетная поддержка", included: !!tariff.prioritySupport },
    { label: "Персональный менеджер", included: !!tariff.personalManager },
  ]
}
