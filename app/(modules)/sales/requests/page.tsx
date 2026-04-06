"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Inbox, Mail, Phone, Building2, MessageSquare, Clock, CheckCircle2,
  XCircle, UserCheck, Loader2, Trash2, RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AccessRequest {
  id: string
  name: string
  email: string
  phone: string | null
  companyName: string | null
  comment: string | null
  status: string
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  new:       { label: "Новая",      className: "bg-blue-500/15 text-blue-700",    icon: <Inbox className="size-3.5" /> },
  contacted: { label: "Связались",  className: "bg-amber-500/15 text-amber-700",  icon: <Phone className="size-3.5" /> },
  approved:  { label: "Одобрена",   className: "bg-emerald-500/15 text-emerald-700", icon: <CheckCircle2 className="size-3.5" /> },
  rejected:  { label: "Отклонена",  className: "bg-red-500/15 text-red-700",      icon: <XCircle className="size-3.5" /> },
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString("ru-RU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/access-requests")
      if (res.ok) {
        const data = await res.json()
        setRequests(data)
      }
    } catch {
      toast.error("Не удалось загрузить заявки")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRequests() }, [])

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status } : r))
        toast.success(`Статус обновлён: ${STATUS_CONFIG[status]?.label}`)
      }
    } catch {
      toast.error("Ошибка обновления")
    }
  }

  const deleteRequest = async (id: string) => {
    try {
      await fetch(`/api/access-requests/${id}`, { method: "DELETE" })
      setRequests((prev) => prev.filter((r) => r.id !== id))
      toast.success("Заявка удалена")
    } catch {
      toast.error("Ошибка удаления")
    }
  }

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter)
  const newCount = requests.filter((r) => r.status === "new").length

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Inbox className="size-5 text-blue-500" />
                <h1 className="text-xl font-semibold">Заявки на подключение</h1>
                {newCount > 0 && (
                  <Badge className="bg-blue-500 text-white text-xs">{newCount} новых</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchRequests}>
                <RefreshCw className="size-3.5" />
                Обновить
              </Button>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3 mb-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все заявки ({requests.length})</SelectItem>
                  <SelectItem value="new">Новые ({requests.filter((r) => r.status === "new").length})</SelectItem>
                  <SelectItem value="contacted">Связались ({requests.filter((r) => r.status === "contacted").length})</SelectItem>
                  <SelectItem value="approved">Одобренные ({requests.filter((r) => r.status === "approved").length})</SelectItem>
                  <SelectItem value="rejected">Отклонённые ({requests.filter((r) => r.status === "rejected").length})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="size-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Заявок пока нет</p>
              </div>
            )}

            {/* List */}
            {!loading && filtered.length > 0 && (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.new
                  return (
                    <div key={r.id} className="border rounded-xl p-5 bg-card hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-sm">{r.name}</h3>
                            <Badge variant="secondary" className={cn("text-[10px] gap-1", st.className)}>
                              {st.icon}{st.label}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Mail className="size-3" />
                              <a href={`mailto:${r.email}`} className="hover:text-foreground">{r.email}</a>
                            </span>
                            {r.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3" />
                                <a href={`tel:${r.phone}`} className="hover:text-foreground">{r.phone}</a>
                              </span>
                            )}
                            {r.companyName && (
                              <span className="flex items-center gap-1">
                                <Building2 className="size-3" />
                                {r.companyName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatDate(r.createdAt)}
                            </span>
                          </div>

                          {r.comment && (
                            <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                              <MessageSquare className="size-3 mt-0.5 shrink-0" />
                              <span>{r.comment}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {r.status === "new" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => updateStatus(r.id, "contacted")}>
                                <Phone className="size-3" />
                                Связались
                              </Button>
                              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => updateStatus(r.id, "approved")}>
                                <UserCheck className="size-3" />
                                Одобрить
                              </Button>
                            </>
                          )}
                          {r.status === "contacted" && (
                            <>
                              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => updateStatus(r.id, "approved")}>
                                <CheckCircle2 className="size-3" />
                                Одобрить
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-destructive" onClick={() => updateStatus(r.id, "rejected")}>
                                <XCircle className="size-3" />
                                Отклонить
                              </Button>
                            </>
                          )}
                          {(r.status === "approved" || r.status === "rejected") && (
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-muted-foreground" onClick={() => deleteRequest(r.id)}>
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
