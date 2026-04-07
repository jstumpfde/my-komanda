"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"
import { Handshake, Plus, Loader2, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface Integrator {
  id: string
  companyName: string | null
  levelName: string | null
  status: string | null
  joinedAt: string | null
  contactName: string | null
  contactEmail: string | null
  companyId: string
}

const LEVEL_COLORS: Record<string, string> = {
  Bronze:   "bg-amber-100 text-amber-700 border-amber-200",
  Silver:   "bg-gray-100 text-gray-700 border-gray-200",
  Gold:     "bg-yellow-100 text-yellow-700 border-yellow-200",
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  VIP:      "bg-red-100 text-red-700 border-red-200",
}

const STATUS_LABELS: Record<string, string> = {
  active:     "Активен",
  suspended:  "Приостановлен",
  terminated: "Завершён",
}

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700",
  suspended:  "bg-amber-100 text-amber-700",
  terminated: "bg-red-100 text-red-700",
}

export default function AdminIntegratorsPage() {
  const router = useRouter()
  const [integrators, setIntegrators] = useState<Integrator[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCompanyId, setNewCompanyId] = useState("")
  const [newContactName, setNewContactName] = useState("")
  const [newContactEmail, setNewContactEmail] = useState("")
  const [newContactPhone, setNewContactPhone] = useState("")

  useEffect(() => {
    fetch("/api/admin/integrators")
      .then(r => r.json())
      .then(data => setIntegrators(data.integrators ?? []))
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newCompanyId.trim()) { toast.error("Укажите ID компании"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/integrators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId:    newCompanyId.trim(),
          contactName:  newContactName || undefined,
          contactEmail: newContactEmail || undefined,
          contactPhone: newContactPhone || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      const { integrator } = await res.json()
      toast.success("Интегратор добавлен")
      setSheetOpen(false)
      setNewCompanyId(""); setNewContactName(""); setNewContactEmail(""); setNewContactPhone("")
      setIntegrators(prev => [...prev, { ...integrator, companyName: null, levelName: null }])
    } catch {
      toast.error("Ошибка при создании")
    } finally {
      setCreating(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Handshake className="w-5 h-5 text-primary" />
                  <h1 className="text-2xl font-semibold text-foreground">Интеграторы</h1>
                </div>
                <p className="text-muted-foreground text-sm">Партнёры и реселлеры платформы</p>
              </div>
              <Button className="gap-1.5" onClick={() => setSheetOpen(true)}>
                <Plus className="w-4 h-4" />
                Добавить
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Компания</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Уровень</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Контакт</th>
                          <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
                          <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Дата вступления</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {integrators.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                              Нет интеграторов
                            </td>
                          </tr>
                        ) : integrators.map(int => (
                          <tr
                            key={int.id}
                            className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                            onClick={() => router.push(`/admin/integrators/${int.id}`)}
                          >
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-foreground">{int.companyName || int.companyId}</span>
                            </td>
                            <td className="px-4 py-3">
                              {int.levelName ? (
                                <Badge className={cn("text-xs border", LEVEL_COLORS[int.levelName] ?? "bg-muted text-muted-foreground")}>
                                  {int.levelName}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="text-xs font-medium text-foreground">{int.contactName || "—"}</p>
                                <p className="text-[11px] text-muted-foreground">{int.contactEmail || ""}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={cn("text-xs", STATUS_COLORS[int.status ?? "active"] ?? "bg-muted")}>
                                {STATUS_LABELS[int.status ?? "active"] ?? int.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {int.joinedAt ? new Date(int.joinedAt).toLocaleDateString("ru-RU") : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); router.push(`/admin/integrators/${int.id}`) }}>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Sheet добавления */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Добавить интегратора</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-1.5">
              <Label className="text-sm">ID компании *</Label>
              <Input value={newCompanyId} onChange={e => setNewCompanyId(e.target.value)} placeholder="uuid..." />
              <p className="text-[11px] text-muted-foreground">UUID компании из списка клиентов</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Контактное имя</Label>
              <Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Иван Петров" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="ivan@partner.ru" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Телефон</Label>
              <Input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="+7 999 123-45-67" />
            </div>
            <Button className="w-full gap-1.5" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? "Добавление..." : "Добавить"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
