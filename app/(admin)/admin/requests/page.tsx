"use client"

import { useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Mail, Loader2, Check, X, Inbox } from "lucide-react"

interface RequestRow {
  id:           string
  createdAt:    string | null
  status:       string | null
  data:         { newEmail?: string; reason?: string; currentEmail?: string } | null
  userId:       string
  userName:     string | null
  userEmail:    string | null
  userRole:     string | null
  companyId:    string | null
  companyName:  string | null
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "new",      label: "Новые" },
  { key: "done",     label: "Принятые" },
  { key: "rejected", label: "Отклонённые" },
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function AdminRequestsPage() {
  const [status, setStatus] = useState("new")
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  // id запроса, по которому сейчас идёт approve/reject — для дизейбла кнопок
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = (st: string) => {
    setLoading(true)
    fetch(`/api/admin/email-change-requests?status=${st}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(status) }, [status])

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/email-change-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Ошибка"); return }
      toast.success(action === "approve" ? "Email изменён" : "Запрос отклонён")
      // Из текущего таба удаляем строку — она уехала в другой статус
      setRows(prev => prev.filter(r => r.id !== id))
    } catch { toast.error("Ошибка сети") }
    finally { setBusyId(null) }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 space-y-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Inbox className="w-5 h-5 text-primary" />
                <h1 className="text-2xl font-semibold text-foreground">Запросы на смену email</h1>
              </div>
              <p className="text-muted-foreground text-sm">
                Заявки от директоров компаний. Остальные роли меняют email сами без запроса.
              </p>
            </div>

            <div className="flex items-center gap-1 border-b border-border">
              {STATUS_TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatus(t.key)}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                    status === t.key
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Запросов нет
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Пользователь</th>
                        <th className="px-4 py-2 font-medium">Компания</th>
                        <th className="px-4 py-2 font-medium">Текущий → Новый</th>
                        <th className="px-4 py-2 font-medium">Причина</th>
                        <th className="px-4 py-2 font-medium">Дата</th>
                        <th className="px-4 py-2 font-medium text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const newEmail = row.data?.newEmail ?? "—"
                        const currentEmail = row.data?.currentEmail ?? row.userEmail ?? "—"
                        const reason = row.data?.reason ?? ""
                        return (
                          <tr key={row.id} className="border-b border-border/50 last:border-0 align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium">{row.userName ?? "—"}</div>
                              {row.userRole && (
                                <Badge variant="outline" className="text-[10px] mt-1">{row.userRole}</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.companyName ?? "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Mail className="w-3 h-3" /> {currentEmail}
                              </div>
                              <div className="flex items-center gap-1.5 text-sm font-medium mt-0.5">
                                <Mail className="w-3.5 h-3.5 text-primary" /> {newEmail}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground max-w-xs">
                              {reason ? <span className="whitespace-pre-wrap break-words">{reason}</span> : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(row.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {status === "new" ? (
                                <div className="inline-flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === row.id}
                                    onClick={() => act(row.id, "reject")}
                                  >
                                    <X className="w-3.5 h-3.5 mr-1" /> Отклонить
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={busyId === row.id}
                                    onClick={() => act(row.id, "approve")}
                                  >
                                    {busyId === row.id
                                      ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                      : <Check className="w-3.5 h-3.5 mr-1" />}
                                    Принять
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">{row.status}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
