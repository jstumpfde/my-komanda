"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Users, UserCheck, TrendingUp, Banknote, Gift, CheckCircle2, Pencil, Save } from "lucide-react"
import { ReferralLinks } from "./referral-links"

// ─── Editable rules structure ─────────────────────────────
interface ReferralRules {
  bonusPerHire: number
  trialMonths: number
  maxActiveReferrals: number
  standardScreening: boolean
}

const DEFAULT_RULES: ReferralRules = {
  bonusPerHire: 10000,
  trialMonths: 3,
  maxActiveReferrals: 5,
  standardScreening: true,
}

// ─── Mock referrers (top table) ───────────────────────────
const REFERRERS = [
  { name: "Анна Иванова", position: "HR-менеджер", referrals: 5, hired: 2, topCandidate: "Андрей Фёдоров" },
  { name: "Дмитрий Козлов", position: "Тимлид", referrals: 4, hired: 1, topCandidate: "Ольга Петрова" },
  { name: "Мария Сидорова", position: "Маркетолог", referrals: 3, hired: 0, topCandidate: "Роман Кузнецов" },
]

export function ReferralTab() {
  const [rules, setRules] = useState<ReferralRules>(DEFAULT_RULES)
  const [editingRules, setEditingRules] = useState(false)
  const [draft, setDraft] = useState<ReferralRules>(DEFAULT_RULES)

  const totalHired = REFERRERS.reduce((s, r) => s + r.hired, 0)
  const totalReferrals = REFERRERS.reduce((s, r) => s + r.referrals, 0)
  const totalPaid = totalHired * rules.bonusPerHire

  const kpi = [
    { label: "Всего рефералов", value: String(totalReferrals), icon: Users, color: "text-blue-600" },
    { label: "Нанято", value: String(totalHired), icon: UserCheck, color: "text-emerald-600" },
    { label: "Ср. скоринг", value: "67", icon: TrendingUp, color: "text-purple-600" },
    { label: "Выплачено", value: `${totalPaid.toLocaleString("ru-RU")} ₽`, icon: Banknote, color: "text-amber-600" },
  ]

  const startEditing = () => {
    setDraft({ ...rules })
    setEditingRules(true)
  }

  const saveRules = () => {
    setRules({ ...draft })
    setEditingRules(false)
    toast.success("Правила программы обновлены")
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <k.icon className={cn("w-4 h-4", k.color)} />
              </div>
              <p className={cn("text-2xl font-bold mt-1", k.color)}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ссылки сотрудников */}
      <ReferralLinks bonusPerHire={rules.bonusPerHire} />

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
                {REFERRERS.map((r) => {
                  const bonus = r.hired * rules.bonusPerHire
                  return (
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
                        <span className={cn("text-sm font-semibold", bonus > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                          {bonus > 0 ? `${bonus.toLocaleString("ru-RU")} ₽` : "—"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Правила программы — редактируемые */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-purple-600" />
                Правила программы
              </CardTitle>
              {!editingRules ? (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEditing} title="Редактировать">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={saveRules} title="Сохранить">
                  <Save className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!editingRules ? (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    За каждого нанятого реферала выплачивается бонус <span className="font-semibold text-foreground">{rules.bonusPerHire.toLocaleString("ru-RU")} ₽</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Бонус выплачивается после испытательного срока (<span className="font-semibold text-foreground">{rules.trialMonths} мес.</span>)
                  </p>
                </div>
                {rules.standardScreening && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">Реферал должен пройти стандартный процесс отбора</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Максимум <span className="font-semibold text-foreground">{rules.maxActiveReferrals}</span> активных рефералов от одного сотрудника
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">Бонус за найм, ₽</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={draft.bonusPerHire}
                    onChange={(e) => setDraft({ ...draft, bonusPerHire: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">Испытательный срок, мес.</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={draft.trialMonths}
                    onChange={(e) => setDraft({ ...draft, trialMonths: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">Макс. активных рефералов</Label>
                  <Input
                    type="number"
                    className="h-8 text-sm"
                    value={draft.maxActiveReferrals}
                    onChange={(e) => setDraft({ ...draft, maxActiveReferrals: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.standardScreening}
                    onChange={(e) => setDraft({ ...draft, standardScreening: e.target.checked })}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-muted-foreground">Стандартный отбор обязателен</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={saveRules}>Сохранить</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingRules(false)}>Отмена</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
