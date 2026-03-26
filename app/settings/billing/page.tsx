"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { DEFAULT_TARIFFS, formatPrice, type Tariff } from "@/lib/tariff-types"
import {
  CreditCard, Smartphone, Building2, FileText, Check, X, Lock,
  Upload, Palette, Bot, Globe, Crown, Sparkles, Star, Receipt, Clock,
} from "lucide-react"

// Текущий тариф клиента (захардкожен)
const currentTariffId = "business"
const usage = { vacancies: 7, candidates: 847 }
const nextBilling = new Date(2026, 3, 1)

export default function BillingPage() {
  const [tariffs] = useState<Tariff[]>(DEFAULT_TARIFFS)
  const [activeTariff, setActiveTariff] = useState(currentTariffId)
  const [showPayment, setShowPayment] = useState(false)
  const [pendingTariff, setPendingTariff] = useState<Tariff | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Branding state
  const [brandColor, setBrandColor] = useState("#1B4FD8")
  const [aiName, setAiName] = useState("Анна")
  const [customDomain, setCustomDomain] = useState("hr.company.ru")

  const current = tariffs.find(t => t.id === activeTariff)!
  const canBrand = current.features.branding
  const canDomain = current.features.customDomain

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
              <p className="text-muted-foreground text-sm">Управление подпиской и настройками брендинга</p>
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
                {[
                  { label: "Договор-оферта", icon: FileText },
                  { label: "Счёт", icon: Receipt },
                  { label: "Акт", icon: FileText },
                ].map(doc => (
                  <Button key={doc.label} variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info(`${doc.label} (заглушка)`)}>
                    <doc.icon className="w-3.5 h-3.5" />
                    {doc.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* ═══ Брендинг ════════════════════════════════════= */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Брендинг</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {canBrand ? "Настройте внешний вид страниц для кандидатов" : "Доступно с тарифа Business"}
              </p>

              <Card className={cn(!canBrand && "opacity-60")}>
                <CardContent className="p-6 space-y-6">
                  {/* Логотип */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Логотип компании</Label>
                      {!canBrand && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <Button variant="outline" size="sm" disabled={!canBrand} onClick={() => toast.info("Загрузка логотипа (заглушка)")}>
                          Загрузить PNG/SVG
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">До 2 МБ, рекомендуем 200x200px</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Цвет */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Основной цвет</Label>
                      {!canBrand && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: brandColor }} />
                      <Input
                        value={brandColor}
                        onChange={(e) => canBrand && setBrandColor(e.target.value)}
                        disabled={!canBrand}
                        className="w-32 h-9 font-mono text-sm"
                      />
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => canBrand && setBrandColor(e.target.value)}
                        disabled={!canBrand}
                        className="w-10 h-10 rounded-lg border cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Имя AI */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Имя AI-рекрутера</Label>
                      {!canBrand && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-muted-foreground" />
                      <Input
                        value={aiName}
                        onChange={(e) => canBrand && setAiName(e.target.value)}
                        disabled={!canBrand}
                        className="w-48 h-9"
                        placeholder="Имя бота"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Отображается в чате с кандидатами</p>
                  </div>

                  <Separator />

                  {/* Домен */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Кастомный домен</Label>
                      {!canDomain && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                      {!canDomain && <Badge variant="outline" className="text-xs">только Pro</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                      <Input
                        value={customDomain}
                        onChange={(e) => canDomain && setCustomDomain(e.target.value)}
                        disabled={!canDomain}
                        className="w-64 h-9"
                        placeholder="hr.yourcompany.ru"
                      />
                    </div>
                  </div>

                  {!canBrand && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <Lock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        Настройки брендинга доступны с тарифа Business
                      </span>
                    </div>
                  )}

                  {canBrand && (
                    <Button className="gap-1.5" onClick={() => toast.success("Настройки брендинга сохранены")}>
                      <Check className="w-4 h-4" /> Сохранить
                    </Button>
                  )}
                </CardContent>
              </Card>
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
