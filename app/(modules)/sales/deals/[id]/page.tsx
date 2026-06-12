"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Handshake, ArrowLeft, Building2, User, UserCircle,
  Calendar, Trash2, Save, Clock,
} from "lucide-react"
import { toast } from "sonner"
import { DEAL_PRIORITIES, DEAL_SOURCES, getDefaultStages, type CrmStage } from "@/lib/crm/deal-stages"
import { cn } from "@/lib/utils"
import { Loader2, MessageSquare, Unlink } from "lucide-react"

// ─── Тип сделки (форма ответа GET /api/modules/sales/deals/[id]) ───────────────

interface Deal {
  id: string
  title: string
  amount: number | null
  currency: string
  stage: string
  priority: string
  probability: number | null
  companyId: string | null
  contactId: string | null
  assignedToId: string | null
  description: string | null
  source: string | null
  expectedCloseDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  companyName: string | null
  contactFirstName: string | null
  contactLastName: string | null
  assignedToName: string | null
}

interface ConvLite {
  id: string
  channel: string
  externalUserName: string | null
  externalUserId: string
  status: string
  dealId: string | null
  contactId: string | null
  lastMessageAt: string | null
}

function formatAmount(amount: number | null) {
  if (!amount) return "—"
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", maximumFractionDigits: 0,
  }).format(amount / 100)
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

function formatDateInput(d: string | null) {
  if (!d) return ""
  return d.slice(0, 10)
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [deal, setDeal] = useState<Deal | null>(null)
  const [stages, setStages] = useState<CrmStage[]>(() => getDefaultStages("b2b"))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Загрузка сделки
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/modules/sales/deals/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (alive) setDeal((j?.data ?? j) as Deal) })
      .catch(() => { if (alive) setDeal(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  // Загрузка стадий воронки тенанта
  useEffect(() => {
    fetch("/api/modules/sales/settings")
      .then((r) => r.json())
      .then((j) => { const d = j?.data ?? j; if (Array.isArray(d?.stages) && d.stages.length) setStages(d.stages as CrmStage[]) })
      .catch(() => {})
  }, [])

  // Диалоги клиента (для привязки и автоматизаций send_message/start_followup)
  const [conversations, setConversations] = useState<ConvLite[]>([])
  const refreshConversations = () => {
    fetch("/api/modules/sales/conversations")
      .then((r) => r.json())
      .then((j) => { const d = j?.data ?? j; setConversations((d.conversations ?? []) as ConvLite[]) })
      .catch(() => {})
  }
  useEffect(() => { refreshConversations() }, [])

  const linkConversation = async (convId: string, dealLink: string | null) => {
    try {
      const res = await fetch("/api/modules/sales/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: convId, dealId: dealLink }),
      })
      if (!res.ok) throw new Error()
      refreshConversations()
      toast.success(dealLink ? "Диалог привязан" : "Диалог отвязан")
    } catch {
      toast.error("Не удалось обновить привязку")
    }
  }

  const wonIds = new Set(stages.filter((s) => s.probability >= 100).map((s) => s.id))
  const lostIds = new Set(stages.filter((s) => s.probability <= 0).map((s) => s.id))

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка сделки…
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!deal) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Сделка не найдена</p>
              <Button variant="outline" onClick={() => router.push("/sales/deals")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                К воронке
              </Button>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const contactName = [deal.contactFirstName, deal.contactLastName].filter(Boolean).join(" ") || null

  const update = (patch: Partial<Deal>) => setDeal((prev) => prev ? { ...prev, ...patch } : prev)

  const handleStageClick = (stageId: string) => {
    const stageInfo = stages.find((s) => s.id === stageId)
    update({
      stage: stageId,
      probability: stageInfo?.probability ?? deal.probability,
      closedAt: wonIds.has(stageId) || lostIds.has(stageId) ? new Date().toISOString() : null,
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/sales/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deal.title,
          amount: deal.amount,
          currency: deal.currency,
          stage: deal.stage,
          priority: deal.priority,
          probability: deal.probability,
          source: deal.source,
          description: deal.description,
          expectedCloseDate: deal.expectedCloseDate,
          closedAt: deal.closedAt,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error) }
      toast.success("Сделка сохранена")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/modules/sales/deals/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Сделка удалена")
      router.push("/sales/deals")
    } catch {
      toast.error("Не удалось удалить")
    }
  }

  const currentStageIdx = stages.findIndex((s) => s.id === deal.stage)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.push("/sales/deals")}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <Handshake className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-semibold">Сделка</h1>
              </div>
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1.5">
                      <Trash2 className="w-4 h-4" />
                      Удалить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить сделку?</AlertDialogTitle>
                      <AlertDialogDescription>Это действие необратимо. Сделка будет удалена навсегда.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Сохранить
                </Button>
              </div>
            </div>

            {/* Stage progress bar */}
            <div className="mb-6">
              <div className="flex gap-1">
                {stages.map((stage, idx) => {
                  const isActive = deal.stage === stage.id
                  const isPast = idx < currentStageIdx && !lostIds.has(deal.stage)
                  return (
                    <button
                      key={stage.id}
                      onClick={() => handleStageClick(stage.id)}
                      className={cn(
                        "flex-1 py-2 px-3 text-xs font-medium rounded-md transition-all text-center",
                        "hover:opacity-80 cursor-pointer",
                        isActive && "text-white shadow-sm",
                        isPast && "text-white/90",
                        !isActive && !isPast && "bg-muted text-muted-foreground",
                      )}
                      style={{
                        backgroundColor: isActive || isPast ? stage.color : undefined,
                        opacity: isPast && !isActive ? 0.6 : 1,
                      }}
                    >
                      {stage.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Left (2/3) — основная информация */}
              <div className="col-span-2 space-y-6">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label>Название</Label>
                      <Input
                        value={deal.title}
                        onChange={(e) => update({ title: e.target.value })}
                        className="text-lg font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label>Сумма</Label>
                        <Input
                          value={deal.amount ? String(deal.amount / 100) : ""}
                          onChange={(e) => update({ amount: e.target.value ? Number(e.target.value) * 100 : null })}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Валюта</Label>
                        <Select value={deal.currency} onValueChange={(v) => update({ currency: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RUB">RUB</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Вероятность (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={deal.probability ?? ""}
                          onChange={(e) => update({ probability: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Приоритет</Label>
                        <Select value={deal.priority} onValueChange={(v) => update({ priority: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DEAL_PRIORITIES.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Источник</Label>
                        <Select value={deal.source || ""} onValueChange={(v) => update({ source: v })}>
                          <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
                          <SelectContent>
                            {DEAL_SOURCES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Ожидаемая дата закрытия</Label>
                      <Input
                        type="date"
                        value={formatDateInput(deal.expectedCloseDate)}
                        onChange={(e) => update({ expectedCloseDate: e.target.value || null })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Описание</Label>
                      <Textarea
                        placeholder="Заметки по сделке..."
                        value={deal.description || ""}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right (1/3) — связи и мета */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Компания
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {deal.companyName ? (
                      <p className="text-sm font-medium">{deal.companyName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не привязана</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Контакт
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {contactName ? (
                      <p className="text-sm font-medium">{contactName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не привязан</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <UserCircle className="w-4 h-4" />
                      Ответственный
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {deal.assignedToName ? (
                      <p className="text-sm font-medium">{deal.assignedToName}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Не назначен</p>
                    )}
                  </CardContent>
                </Card>

                {/* Диалог клиента */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Диалог клиента
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {(() => {
                      const linked = conversations.find((c) => c.dealId === id)
                      if (linked) {
                        return (
                          <div className="space-y-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">{linked.externalUserName || linked.externalUserId}</p>
                              <p className="text-xs text-muted-foreground capitalize">{linked.channel}{linked.status === "paused_for_human" ? " · на менеджере" : ""}</p>
                            </div>
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => linkConversation(linked.id, null)}>
                              <Unlink className="w-3.5 h-3.5" /> Отвязать
                            </Button>
                            <p className="text-[11px] text-muted-foreground">Автоматизации «написать клиенту» и «дожим» используют этот диалог.</p>
                          </div>
                        )
                      }
                      const linkable = conversations.filter((c) => !c.dealId && (!deal.contactId || !c.contactId || c.contactId === deal.contactId))
                      if (linkable.length === 0) {
                        return <p className="text-sm text-muted-foreground">Нет свободных диалогов для привязки.</p>
                      }
                      return (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Привяжите диалог бота — чтобы автоматизации могли писать клиенту.</p>
                          <Select onValueChange={(v) => linkConversation(v, id)}>
                            <SelectTrigger><SelectValue placeholder="Выбрать диалог" /></SelectTrigger>
                            <SelectContent>
                              {linkable.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{(c.externalUserName || c.externalUserId)} · {c.channel}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Даты
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Создана</span>
                      <span>{formatDate(deal.createdAt)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Обновлена</span>
                      <span>{formatDate(deal.updatedAt)}</span>
                    </div>
                    {deal.closedAt && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Закрыта</span>
                        <span>{formatDate(deal.closedAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Сумма</span>
                      <span className="text-lg font-bold">{formatAmount(deal.amount)}</span>
                    </div>
                    {!wonIds.has(deal.stage) && !lostIds.has(deal.stage) && deal.probability != null && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">Взвешенная</span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatAmount(deal.amount && deal.probability ? Math.round(deal.amount * deal.probability / 100) : null)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
