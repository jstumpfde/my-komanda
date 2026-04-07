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
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  DEFAULT_REFERRERS, DEFAULT_TRIGGERS,
  REFERRER_TYPE_LABELS, REFERRER_TYPE_COLORS, STATUS_LABELS,
  generateRefLink,
  type Referrer, type ReferrerType, type PayoutTrigger,
} from "@/lib/referral-types"
import {
  Users, UserPlus, Gift, Wallet, TrendingUp, Copy, Check,
  Link2, QrCode, ExternalLink, Plus, Save,
} from "lucide-react"

export default function ReferralsPage() {
  const [referrers, setReferrers] = useState<Referrer[]>(DEFAULT_REFERRERS)
  const [triggers, setTriggers] = useState<PayoutTrigger[]>(DEFAULT_TRIGGERS)
  const [addOpen, setAddOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  // Add form
  const [newName, setNewName] = useState("")
  const [newContact, setNewContact] = useState("")
  const [newType, setNewType] = useState<ReferrerType>("employee")

  const totalReferrers = referrers.filter(r => r.status === "active").length
  const totalCandidates = referrers.reduce((s, r) => s + r.candidates.length, 0)
  const totalHired = referrers.reduce((s, r) => s + r.candidates.filter(c => c.stage === "Нанят").length, 0)
  const totalPaid = referrers.reduce((s, r) => s + r.totalEarned, 0)
  const maxPerCandidate = triggers.filter(t => t.enabled).reduce((s, t) => s + t.amount, 0)

  const handleAdd = () => {
    if (!newName.trim()) { toast.error("Введите имя"); return }
    const code = generateRefLink()
    const ref: Referrer = {
      id: `ref-${code}`,
      name: newName,
      contact: newContact,
      type: newType,
      status: "active",
      totalEarned: 0,
      link: `/ref/ref-${code}`,
      createdAt: new Date(),
      candidates: [],
    }
    setReferrers(prev => [...prev, ref])
    setAddOpen(false)
    setNewName("")
    setNewContact("")
    toast.success(`Реферер ${newName} создан. Ссылка: ${ref.link}`)
  }

  const handleCopyLink = async (link: string) => {
    const full = `${typeof window !== "undefined" ? window.location.origin : ""}${link}`
    await navigator.clipboard.writeText(full)
    setCopiedLink(link)
    toast.success("Ссылка скопирована")
    setTimeout(() => setCopiedLink(null), 2000)
  }

  const updateTrigger = (id: string, patch: Partial<PayoutTrigger>) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  const stats = [
    { label: "Активных рефереров", value: totalReferrers, icon: Users, color: "text-blue-600 bg-blue-500/10" },
    { label: "Привлечено кандидатов", value: totalCandidates, icon: UserPlus, color: "text-purple-600 bg-purple-500/10" },
    { label: "Нанято", value: totalHired, icon: Gift, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Выплачено", value: `${totalPaid.toLocaleString("ru-RU")} ₽`, icon: Wallet, color: "text-amber-600 bg-amber-500/10" },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Реферальная программа</h1>
                <p className="text-muted-foreground text-sm">Привлекайте кандидатов через партнёров и сотрудников</p>
              </div>
              <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить реферера
              </Button>
            </div>

            {/* ═══ KPI ═════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {stats.map(s => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", s.color)}>
                      <s.icon className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ═══ Таблица рефереров ═══════════════════════════ */}
            <Card className="mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Рефереры</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Имя</th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Тип</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Кандидатов</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Нанято</th>
                        <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Заработано</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ссылка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrers.map(ref => {
                        const hired = ref.candidates.filter(c => c.stage === "Нанят").length
                        return (
                          <tr key={ref.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{ref.name}</p>
                                <p className="text-xs text-muted-foreground">{ref.contact}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn("text-xs", REFERRER_TYPE_COLORS[ref.type])}>
                                {REFERRER_TYPE_LABELS[ref.type]}
                              </Badge>
                            </td>
                            <td className="text-right px-4 py-3 text-sm font-medium text-foreground">{ref.candidates.length}</td>
                            <td className="text-right px-4 py-3 text-sm font-medium text-foreground">{hired}</td>
                            <td className="text-right px-4 py-3 text-sm font-medium text-foreground">
                              {ref.totalEarned.toLocaleString("ru-RU")} ₽
                            </td>
                            <td className="text-center px-4 py-3">
                              <Badge variant="outline" className={cn("text-xs",
                                ref.status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-muted text-muted-foreground border-border"
                              )}>
                                {STATUS_LABELS[ref.status]}
                              </Badge>
                            </td>
                            <td className="text-center px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => handleCopyLink(ref.link)}
                                >
                                  {copiedLink === ref.link ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={ref.link} target="_blank">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ═══ Условия программы ═══════════════════════════ */}
            <Card className="mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="w-4 h-4" />
                  Условия программы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Настройте триггеры и суммы выплат рефереру</p>

                <div className="space-y-3">
                  {triggers.map(trigger => (
                    <div
                      key={trigger.id}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-lg border transition-all",
                        trigger.enabled ? "bg-card" : "bg-muted/30 opacity-60"
                      )}
                    >
                      <Checkbox
                        checked={trigger.enabled}
                        onCheckedChange={(v) => updateTrigger(trigger.id, { enabled: !!v })}
                      />
                      <span className="text-lg shrink-0">{trigger.emoji}</span>
                      <span className="text-sm font-medium text-foreground flex-1">{trigger.label}</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={trigger.amount || ""}
                          onChange={(e) => updateTrigger(trigger.id, { amount: Number(e.target.value) })}
                          disabled={!trigger.enabled}
                          className="w-24 h-8 text-sm text-right font-mono"
                          placeholder="0"
                        />
                        <span className="text-xs text-muted-foreground">₽</span>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="text-sm font-medium text-foreground">Максимум за кандидата</span>
                  <span className="text-lg font-bold text-primary">{maxPerCandidate.toLocaleString("ru-RU")} ₽</span>
                </div>

                <Button className="gap-1.5" onClick={() => toast.success("Условия программы сохранены")}>
                  <Save className="w-4 h-4" />
                  Сохранить условия
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>

      {/* ═══ Диалог добавления реферера ═══════════════════════ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Добавить реферера
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Имя</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Иванов А." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email или Telegram</Label>
              <Input value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="@username или email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Тип</Label>
              <Select value={newType} onValueChange={v => setNewType(v as ReferrerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REFERRER_TYPE_LABELS) as [ReferrerType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
              После создания будет сгенерирована персональная ссылка и QR-код для привлечения кандидатов.
            </div>

            <Button className="w-full gap-1.5" onClick={handleAdd}>
              <Link2 className="w-4 h-4" />
              Создать реферера
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
