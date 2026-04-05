"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Heart, Users, UserCheck, TrendingUp, Banknote, Copy, Gift, CheckCircle2 } from "lucide-react"

// ─── Mock data ─────────────────────────────────────────
const REFERRAL_KPI = [
  { label: "Всего рефералов", value: "12", icon: Users, color: "text-blue-600" },
  { label: "Нанято", value: "3", icon: UserCheck, color: "text-emerald-600" },
  { label: "Ср. скоринг", value: "67", icon: TrendingUp, color: "text-purple-600" },
  { label: "Выплачено", value: "45 000 ₽", icon: Banknote, color: "text-amber-600" },
]

const REFERRERS = [
  { name: "Анна Иванова", position: "HR-менеджер", referrals: 5, hired: 2, bonus: 20000, topCandidate: "Андрей Фёдоров" },
  { name: "Дмитрий Козлов", position: "Тимлид", referrals: 4, hired: 1, bonus: 10000, topCandidate: "Ольга Петрова" },
  { name: "Мария Сидорова", position: "Маркетолог", referrals: 3, hired: 0, bonus: 0, topCandidate: "Роман Кузнецов" },
]

const RULES = [
  "За каждого нанятого реферала выплачивается бонус 10 000 ₽",
  "Бонус выплачивается после прохождения испытательного срока (3 мес.)",
  "Реферал должен пройти стандартный процесс отбора",
  "Максимум 5 активных рефералов одновременно от одного сотрудника",
]

export function ReferralTab() {
  const [copied, setCopied] = useState(false)
  const referralLink = "https://komanda.app/ref/abc123"

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true)
      toast.success("Ссылка скопирована")
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {REFERRAL_KPI.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Таблица рефереров */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Топ рефереров</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Сотрудник</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Рефералов</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Нанято</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Бонус</th>
                </tr>
              </thead>
              <tbody>
                {REFERRERS.map((r) => (
                  <tr key={r.name} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground">{r.position}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="secondary" className="text-xs">{r.referrals}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant={r.hired > 0 ? "default" : "outline"} className="text-xs">{r.hired}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("text-sm font-semibold", r.bonus > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                        {r.bonus > 0 ? `${r.bonus.toLocaleString("ru-RU")} ₽` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Правила + виджет */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-purple-600" />
                Правила программы
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {RULES.map((rule, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">{rule}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-pink-200 bg-pink-50/50 dark:bg-pink-950/10 dark:border-pink-900/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                <p className="text-sm font-semibold">Порекомендуй друга</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Поделитесь ссылкой с потенциальным кандидатом. За каждого нанятого вы получите бонус.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background rounded-md border px-3 py-1.5 text-xs text-muted-foreground truncate">
                  {referralLink}
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Готово" : "Копировать"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
