"use client"

import { useState, useEffect, use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getReferrerById, REFERRER_TYPE_LABELS, REFERRER_TYPE_COLORS, type Referrer } from "@/lib/referral-types"
import { getBrand, type BrandConfig } from "@/lib/branding"
import {
  Copy, Check, Download, QrCode, Users, Gift, Wallet,
  ExternalLink, Clock, ChevronRight, Link2,
} from "lucide-react"

export default function ReferrerPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [referrer, setReferrer] = useState<Referrer | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [brand, setBrand] = useState<BrandConfig | null>(null)

  useEffect(() => {
    setBrand(getBrand())
    const r = getReferrerById(id)
    setReferrer(r)
    setLoading(false)
  }, [id])

  const accentColor = brand?.primaryColor || "#3b82f6"
  const bgColor = brand?.bgColor || "#f0f4ff"
  const logoUrl = brand?.logoUrl
  const companyName = brand?.companyName || "Моя Команда"

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  if (!referrer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="text-4xl mb-4">🔗</div>
            <h1 className="text-xl font-bold mb-2">Реферер не найден</h1>
            <p className="text-muted-foreground text-sm">Проверьте ссылку или обратитесь к менеджеру.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const fullLink = typeof window !== "undefined" ? `${window.location.origin}${referrer.link}` : referrer.link
  const hired = referrer.candidates.filter(c => c.stage === "Нанят").length
  const allPayouts = referrer.candidates.flatMap(c => c.payouts).sort((a, b) => b.date.getTime() - a.date.getTime())

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullLink)
    setCopied(true)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopied(false), 2000)
  }

  // QR-код — SVG-заглушка
  const qrSize = 180
  const qrPlaceholder = (
    <div className="w-[180px] h-[180px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center bg-white">
      <QrCode className="w-16 h-16 text-muted-foreground/30 mb-2" />
      <p className="text-xs text-muted-foreground">QR-код</p>
      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{referrer.id}</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-9 h-9 rounded-lg object-contain" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: accentColor }}>{companyName[0]}</div>
            )}
            <span className="text-lg font-bold text-foreground">{companyName}</span>
          </div>
          <Badge variant="outline" className={cn("text-xs", REFERRER_TYPE_COLORS[referrer.type])}>
            {REFERRER_TYPE_LABELS[referrer.type]}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Приветствие */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{referrer.name}</h1>
          <p className="text-muted-foreground">Реферальная панель</p>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{referrer.candidates.length}</p>
              <p className="text-xs text-muted-foreground">Кандидатов</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Gift className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{hired}</p>
              <p className="text-xs text-muted-foreground">Нанято</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Wallet className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{referrer.totalEarned.toLocaleString("ru-RU")} ₽</p>
              <p className="text-xs text-muted-foreground">Заработано</p>
            </CardContent>
          </Card>
        </div>

        {/* Ссылка + QR */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Ваша реферальная ссылка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1 space-y-3 w-full">
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2.5 rounded-lg bg-muted/50 border text-sm font-mono text-foreground truncate">
                    {fullLink}
                  </div>
                  <Button variant="outline" size="icon" className="shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Делитесь этой ссылкой — все кандидаты, перешедшие по ней, автоматически привязываются к вам.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачивание QR (заглушка)")}>
                    <Download className="w-3.5 h-3.5" />
                    Скачать QR (PNG)
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Скачивание PDF (заглушка)")}>
                    <Download className="w-3.5 h-3.5" />
                    Скачать QR (PDF)
                  </Button>
                </div>
              </div>
              {qrPlaceholder}
            </div>
          </CardContent>
        </Card>

        {/* Кандидаты */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Ваши кандидаты
              <Badge variant="secondary" className="text-xs ml-1">{referrer.candidates.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Имя</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Вакансия</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-2.5">Статус</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {referrer.candidates.slice(0, 20).map(c => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{c.vacancy}</td>
                      <td className="text-center px-4 py-2.5">
                        <Badge variant="outline" className={cn("text-xs",
                          c.stage === "Нанят" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200" :
                          c.stage === "Интервью" ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200" :
                          "bg-muted text-muted-foreground border-border"
                        )}>
                          {c.stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {c.addedAt.toLocaleDateString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {referrer.candidates.length > 20 && (
                <div className="text-center py-3 text-xs text-muted-foreground">
                  Показано 20 из {referrer.candidates.length}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* История начислений */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              История начислений
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allPayouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Начислений пока нет</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {allPayouts.slice(0, 30).map((p, i) => {
                  const candidate = referrer.candidates.find(c => c.payouts.includes(p))
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Wallet className="w-3 h-3 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-foreground truncate block">{p.trigger}</span>
                          {candidate && <span className="text-xs text-muted-foreground">{candidate.name}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="font-semibold text-emerald-600">+{p.amount.toLocaleString("ru-RU")} ₽</span>
                        <p className="text-[10px] text-muted-foreground">{p.date.toLocaleDateString("ru-RU")}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <Separator className="my-4" />

            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium text-foreground">Итого заработано</span>
              <span className="text-xl font-bold text-primary">{referrer.totalEarned.toLocaleString("ru-RU")} ₽</span>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 py-4">
          Powered by Моя Команда
        </p>
      </div>
    </div>
  )
}
