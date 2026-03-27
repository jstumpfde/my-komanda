"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { DEFAULT_TARIFFS, formatPrice, type Tariff } from "@/lib/tariff-types"
import {
  CreditCard, Smartphone, Building2, FileText, Check, X,
  Crown, Sparkles, Receipt, Clock,
} from "lucide-react"
import QRCode from "qrcode"

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
  { label: "1 месяц", months: 1, discount: 0 },
  { label: "3 месяца", months: 3, discount: 5 },
  { label: "6 месяцев", months: 6, discount: 10 },
  { label: "12 месяцев", months: 12, discount: 15 },
]

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const period = PERIODS[periodIdx]
  const baseAmount = tariff.price * period.months
  const discountAmount = Math.round(baseAmount * period.discount / 100)
  const totalAmount = baseAmount - discountAmount

  const qrText = `Оплата тарифа ${tariff.name} за ${period.label}, сумма ${totalAmount.toLocaleString("ru-RU")} руб., ИП Штумпф Ю.Г., ИНН ${REQUISITES.inn}`

  useEffect(() => {
    if (!open || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrText, { width: 160, margin: 1 }, (err) => {
      if (err) console.error(err)
    })
  }, [open, qrText])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Выставить счёт</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
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
              <span className="font-mono">{REQUISITES.bankAccount}</span>
              <span className="text-muted-foreground">Банк</span>
              <span>{REQUISITES.bankName}</span>
              <span className="text-muted-foreground">БИК</span>
              <span className="font-mono">{REQUISITES.bik}</span>
              <span className="text-muted-foreground">Корр. счёт</span>
              <span className="font-mono">{REQUISITES.corrAccount}</span>
            </div>
          </div>

          {/* QR-код */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">QR-код для оплаты</p>
            <canvas ref={canvasRef} className="rounded-lg border" />
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => alert("Скоро")}
            >
              <FileText className="w-4 h-4 mr-1.5" />
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

  const current = tariffs.find(t => t.id === activeTariff)!

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

      {/* ═══ Выбор тарифа ════════════════════════════════ */}
      <div id="tariff-cards" className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Выбор тарифа</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tariffs.map(tariff => {
            const isCurrent = tariff.id === activeTariff
            const features = getTariffFeatures(tariff)
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
                <CardContent className="p-5 pt-6">
                  <div className="text-center mb-4">
                    <h4 className="text-lg font-bold text-foreground">{tariff.name}</h4>
                    <div className="mt-1">
                      {tariff.price === 0 ? (
                        <div>
                          <span className="text-2xl font-bold text-foreground">Бесплатно</span>
                          <p className="text-xs text-muted-foreground">{tariff.trialDays} дней</p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-2xl font-bold text-foreground">{tariff.price.toLocaleString("ru-RU")}</span>
                          <span className="text-sm text-muted-foreground"> ₽/мес</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator className="mb-4" />

                  <div className="space-y-2 mb-5">
                    {features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {f.included ? (
                          <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                        )}
                        <span className={cn("text-xs", f.included ? "text-foreground" : "text-muted-foreground/60 line-through")}>
                          {f.label}
                        </span>
                      </div>
                    ))}
                  </div>

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
          <button className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left" onClick={() => toast.info("Оплата картой (заглушка)")}>
            <CreditCard className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-foreground">Карта (ЮKassa)</p>
              <p className="text-xs text-muted-foreground">Visa, MasterCard, МИР</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left" onClick={() => toast.info("Оплата через СБП (заглушка)")}>
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-foreground">СБП — без комиссии</p>
              <p className="text-xs text-muted-foreground">Моментальное зачисление</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left" onClick={() => toast.info("Выставлен счёт (заглушка)")}>
            <Building2 className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-foreground">Расчётный счёт</p>
              <p className="text-xs text-muted-foreground">Для юридических лиц</p>
            </div>
          </button>
        </div>
      </div>

      {/* ═══ Документы ════════════════════════════════════ */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">Документы</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Договор-оферта (заглушка)")}>
            <FileText className="w-3.5 h-3.5" />
            Договор-оферта
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowInvoice(true)}>
            <Receipt className="w-3.5 h-3.5" />
            Счёт
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Акт (заглушка)")}>
            <FileText className="w-3.5 h-3.5" />
            Акт
          </Button>
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
    </>
  )
}

function getTariffFeatures(tariff: Tariff): { label: string; included: boolean }[] {
  const v = tariff.maxVacancies === 999 ? "Безлимит" : `До ${tariff.maxVacancies}`
  return [
    { label: `${v} вакансий`, included: true },
    { label: `До ${tariff.maxCandidates.toLocaleString("ru-RU")} кандидатов`, included: true },
    { label: "Все базовые функции", included: true },
    { label: "Полный брендинг (логотип + цвета)", included: tariff.features.branding },
    { label: "Имя AI-рекрутера", included: !!tariff.aiRecruiterName },
    { label: "Приоритетная поддержка", included: !!tariff.prioritySupport },
    { label: "Персональный менеджер", included: !!tariff.personalManager },
    { label: "Кастомный домен", included: tariff.features.customDomain },
    { label: "API доступ", included: tariff.features.api },
  ]
}
