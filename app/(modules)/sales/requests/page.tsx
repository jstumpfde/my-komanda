"use client"

import { useState, useEffect, DragEvent } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Inbox, Mail, Phone, Building2, MessageSquare, Clock, CheckCircle2,
  XCircle, UserCheck, Loader2, Trash2, RefreshCw, List, LayoutGrid,
  PauseCircle, HelpCircle, MoreHorizontal,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type ViewMode = "list" | "kanban"

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
  new:        { label: "Новый",        className: "bg-blue-500/15 text-blue-700",       icon: <Inbox className="size-3.5" /> },
  contacted:  { label: "Был контакт",  className: "bg-amber-500/15 text-amber-700",     icon: <Phone className="size-3.5" /> },
  deciding:   { label: "Решает",       className: "bg-purple-500/15 text-purple-700",   icon: <HelpCircle className="size-3.5" /> },
  postponed:  { label: "Отложено",     className: "bg-gray-500/15 text-gray-700",       icon: <PauseCircle className="size-3.5" /> },
  approved:   { label: "Подключён",    className: "bg-emerald-500/15 text-emerald-700", icon: <CheckCircle2 className="size-3.5" /> },
  rejected:   { label: "Отменён",      className: "bg-red-500/15 text-red-700",         icon: <XCircle className="size-3.5" /> },
}

const KANBAN_COLUMNS = ["new", "contacted", "deciding", "postponed", "approved", "rejected"] as const

function formatDate(d: string): string {
  return new Date(d).toLocaleString("ru-RU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export default function AccessRequestsPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [draggedId, setDraggedId] = useState<string | null>(null)

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

  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null)

  const handleDisconnect = () => {
    if (confirmDisconnect) {
      updateStatus(confirmDisconnect, "new")
      setConfirmDisconnect(null)
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

            {/* Filter + View Toggle */}
            <div className="flex items-center justify-between mb-4">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="h-8 w-48 text-xs border border-input rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все заявки ({requests.length})</SelectItem>
                  <SelectItem value="new">Новые ({requests.filter((r) => r.status === "new").length})</SelectItem>
                  <SelectItem value="contacted">Был контакт ({requests.filter((r) => r.status === "contacted").length})</SelectItem>
                  <SelectItem value="deciding">Решает ({requests.filter((r) => r.status === "deciding").length})</SelectItem>
                  <SelectItem value="postponed">Отложено ({requests.filter((r) => r.status === "postponed").length})</SelectItem>
                  <SelectItem value="approved">Подключён ({requests.filter((r) => r.status === "approved").length})</SelectItem>
                  <SelectItem value="rejected">Отменён ({requests.filter((r) => r.status === "rejected").length})</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-0.5 border border-input rounded-md p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode("list")}
                >
                  <List className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode("kanban")}
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>
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

            {/* List View */}
            {!loading && filtered.length > 0 && viewMode === "list" && (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.new
                  return (
                    <div key={r.id} className="border rounded-xl p-5 bg-card">
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
                          {r.status !== "approved" && (
                            <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => updateStatus(r.id, "approved")}>
                              <CheckCircle2 className="size-3" />Подключить
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.status !== "new" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => updateStatus(r.id, "new")}>
                                  <Inbox className="size-3.5" />Новый
                                </DropdownMenuItem>
                              )}
                              {r.status !== "contacted" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => updateStatus(r.id, "contacted")}>
                                  <Phone className="size-3.5" />Связались
                                </DropdownMenuItem>
                              )}
                              {r.status !== "deciding" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => updateStatus(r.id, "deciding")}>
                                  <HelpCircle className="size-3.5" />Решает
                                </DropdownMenuItem>
                              )}
                              {r.status !== "postponed" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => updateStatus(r.id, "postponed")}>
                                  <PauseCircle className="size-3.5" />Отложить
                                </DropdownMenuItem>
                              )}
                              {r.status !== "approved" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => updateStatus(r.id, "approved")}>
                                  <CheckCircle2 className="size-3.5 text-emerald-600" />Подключить
                                </DropdownMenuItem>
                              )}
                              {r.status === "approved" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer text-amber-600" onClick={() => setConfirmDisconnect(r.id)}>
                                  <XCircle className="size-3.5" />Отключить
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {r.status !== "rejected" && (
                                <DropdownMenuItem className="gap-2 text-xs cursor-pointer text-destructive" onClick={() => updateStatus(r.id, "rejected")}>
                                  <XCircle className="size-3.5" />Отклонить
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="gap-2 text-xs cursor-pointer text-destructive" onClick={() => deleteRequest(r.id)}>
                                <Trash2 className="size-3.5" />Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Kanban View */}
            {!loading && viewMode === "kanban" && (
              <div className="flex gap-3 overflow-x-auto pb-4">
                {KANBAN_COLUMNS.map((colStatus) => {
                  const config = STATUS_CONFIG[colStatus]
                  const columnRequests = requests.filter((r) => r.status === colStatus)

                  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                  }

                  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData("text/plain")
                    if (id && id !== colStatus) {
                      updateStatus(id, colStatus)
                    }
                    setDraggedId(null)
                  }

                  return (
                    <div
                      key={colStatus}
                      className="flex-shrink-0 w-[240px] bg-muted/30 rounded-xl flex flex-col"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      {/* Column Header */}
                      <div className="p-3 pb-2 flex items-center gap-2">
                        <Badge variant="secondary" className={cn("text-[10px] gap-1", config.className)}>
                          {config.icon}{config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-medium">{columnRequests.length}</span>
                      </div>

                      {/* Column Cards */}
                      <div className="flex-1 p-2 pt-0 space-y-2 min-h-[100px]">
                        {columnRequests.map((r) => (
                          <div
                            key={r.id}
                            draggable
                            onDragStart={(e: DragEvent<HTMLDivElement>) => {
                              e.dataTransfer.setData("text/plain", r.id)
                              e.dataTransfer.effectAllowed = "move"
                              setDraggedId(r.id)
                            }}
                            onDragEnd={() => setDraggedId(null)}
                            className={cn(
                              "border rounded-lg p-3 bg-card cursor-grab active:cursor-grabbing",
                              draggedId === r.id && "opacity-50"
                            )}
                          >
                            <p className="font-medium text-sm truncate">{r.name}</p>
                            <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1 truncate">
                                <Mail className="size-3 shrink-0" />
                                <span className="truncate">{r.email}</span>
                              </div>
                              {r.phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="size-3 shrink-0" />
                                  <span>{r.phone}</span>
                                </div>
                              )}
                              {r.companyName && (
                                <div className="flex items-center gap-1 truncate">
                                  <Building2 className="size-3 shrink-0" />
                                  <span className="truncate">{r.companyName}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Clock className="size-3 shrink-0" />
                                <span>{formatDate(r.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      <AlertDialog open={!!confirmDisconnect} onOpenChange={(open) => !open && setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить клиента?</AlertDialogTitle>
            <AlertDialogDescription>Заявка вернётся в статус «Новый». Вы уверены?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Отключить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}
