"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CreatePlanButton } from "@/components/admin/create-plan-button"
import {
  Package, Pencil, MoreHorizontal, Archive, Trash2, Trash, RotateCcw, AlertTriangle, Loader2,
} from "lucide-react"
import { toast } from "sonner"

type View = "active" | "archived" | "trash"
const VIEWS: View[] = ["active", "archived", "trash"]

interface PlanRow {
  id: string
  slug: string
  name: string
  price: number
  currency: string | null
  interval: string | null
  isPublic: boolean | null
  sortOrder: number | null
  clientCount: number
  archivedAt: string | null
  deletedAt: string | null
  modules: { id: string; slug: string; name: string; icon: string | null }[]
}

interface ApiResponse {
  data: PlanRow[]
  counts: { archived: number; trashed: number }
}

function formatPrice(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU") + " ₽"
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU")
}

function TabCount({ n }: { n: number }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
      {n.toLocaleString("ru-RU")}
    </span>
  )
}

function AdminPlansInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initial = searchParams.get("view")
  const [view, setView] = useState<View>(VIEWS.includes(initial as View) ? (initial as View) : "active")

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ApiResponse>({ data: [], counts: { archived: 0, trashed: 0 } })

  // Диалоги подтверждения
  const [archiveTarget, setArchiveTarget] = useState<PlanRow | null>(null)
  const [archiving, setArchiving] = useState(false)

  const [trashTarget, setTrashTarget] = useState<PlanRow | null>(null)
  const [trashing, setTrashing] = useState(false)

  const [permanentTarget, setPermanentTarget] = useState<PlanRow | null>(null)
  const [permanentTyped, setPermanentTyped] = useState("")
  const [permanentBusy, setPermanentBusy] = useState(false)

  const [restoringId, setRestoringId] = useState<string | null>(null)

  const fetchData = useCallback(async (v: View) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (v === "archived") q.set("archived", "true")
      if (v === "trash") q.set("trashed", "true")
      const res = await fetch(`/api/admin/plans?${q.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(view) }, [view, fetchData])

  const refetch = () => fetchData(view)

  function changeView(v: string) {
    const next = v as View
    setView(next)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === "active") params.delete("view")
    else params.set("view", next)
    const qs = params.toString()
    router.replace(qs ? `/admin/plans?${qs}` : "/admin/plans", { scroll: false })
  }

  // В архив
  async function handleArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/admin/plans/${archiveTarget.id}/archive`, { method: "POST" })
      if (res.ok) {
        toast.success("Тариф перемещён в архив")
        setArchiveTarget(null)
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось переместить в архив")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setArchiving(false)
    }
  }

  // Восстановить из архива
  async function handleRestoreFromArchive(plan: PlanRow) {
    setRestoringId(plan.id)
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}/archive`, { method: "DELETE" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Тариф восстановлен из архива")
      refetch()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setRestoringId(null)
    }
  }

  // В корзину
  async function handleTrash() {
    if (!trashTarget) return
    setTrashing(true)
    try {
      const res = await fetch(`/api/admin/plans/${trashTarget.id}/trash`, { method: "POST" })
      if (res.ok) {
        toast.success("Тариф перемещён в корзину")
        setTrashTarget(null)
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось переместить в корзину")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setTrashing(false)
    }
  }

  // Восстановить из корзины
  async function handleRestoreFromTrash(plan: PlanRow) {
    setRestoringId(plan.id)
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}/trash`, { method: "PATCH" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Тариф восстановлен из корзины")
      refetch()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setRestoringId(null)
    }
  }

  // Удалить навсегда
  async function handlePermanent() {
    if (!permanentTarget) return
    setPermanentBusy(true)
    try {
      const res = await fetch(`/api/admin/plans/${permanentTarget.id}/trash`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Тариф удалён навсегда")
        setPermanentTarget(null)
        setPermanentTyped("")
        refetch()
      } else {
        const b = await res.json().catch(() => ({}))
        toast.error(b.error || "Не удалось удалить")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setPermanentBusy(false)
    }
  }

  const permanentConfirmed = permanentTarget !== null && permanentTyped.trim() === permanentTarget.name.trim()
  const plans = data.data

  return (
    <AdminPageLayout>
      <div className="py-6 px-8">
        <div className="mb-6">
          <div className="flex items-center justify-between pt-3 pb-2">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Тарифы</h1>
            </div>
            {view === "active" && <CreatePlanButton />}
          </div>
          <p className="text-muted-foreground text-sm">Управление тарифными планами и модулями</p>
        </div>

        {/* Табы */}
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <Tabs value={view} onValueChange={changeView}>
            <TabsList>
              <TabsTrigger value="active" className="gap-1.5">
                <Package className="w-3.5 h-3.5" />Активные
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-1.5">
                <Archive className="w-3.5 h-3.5" />Архив
                {data.counts.archived > 0 && <TabCount n={data.counts.archived} />}
              </TabsTrigger>
              <TabsTrigger value="trash" className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />Корзина
                {data.counts.trashed > 0 && <TabCount n={data.counts.trashed} />}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Таблица */}
        <TableCard>
          <DataTable containerClassName="overflow-x-auto">
            <DataHead>
              <DataHeadCell>Название</DataHeadCell>
              <DataHeadCell>Slug</DataHeadCell>
              <DataHeadCell align="right">Цена</DataHeadCell>
              <DataHeadCell>Модули</DataHeadCell>
              <DataHeadCell align="right">Клиентов</DataHeadCell>
              <DataHeadCell align="center">Статус</DataHeadCell>
              {view === "archived" && <DataHeadCell>В архиве с</DataHeadCell>}
              {view === "trash" && <DataHeadCell>В корзине с</DataHeadCell>}
              <DataHeadCell align="right" />
            </DataHead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={view === "active" ? 7 : 8} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!loading && plans.length === 0 && (
                <tr>
                  <td colSpan={view === "active" ? 7 : 8} className="text-center py-10 text-sm text-muted-foreground">
                    {view === "archived" ? "Архив пуст" : view === "trash" ? "Корзина пуста" : "Тарифы не найдены"}
                  </td>
                </tr>
              )}
              {!loading && plans.map(plan => (
                <DataRow key={plan.id}>
                  <DataCell>
                    <p className="font-medium text-foreground">{plan.name}</p>
                  </DataCell>
                  <DataCell>
                    <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {plan.slug}
                    </code>
                  </DataCell>
                  <DataCell align="right">
                    <p className="font-semibold text-foreground">{formatPrice(plan.price)}</p>
                    <p className="text-xs text-muted-foreground">/{plan.interval === "month" ? "мес" : "год"}</p>
                  </DataCell>
                  <DataCell>
                    <div className="flex flex-wrap gap-1">
                      {plan.modules.length === 0
                        ? <span className="text-xs text-muted-foreground">—</span>
                        : plan.modules.map(m => (
                          <Badge key={m.id} variant="secondary" className="text-xs">{m.name}</Badge>
                        ))
                      }
                    </div>
                  </DataCell>
                  <DataCell align="right">
                    <span className="font-medium text-foreground">{plan.clientCount}</span>
                  </DataCell>
                  <DataCell align="center">
                    <Badge
                      variant="outline"
                      className={plan.isPublic
                        ? "text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800"
                        : "text-xs text-muted-foreground"
                      }
                    >
                      {plan.isPublic ? "Публичный" : "Скрытый"}
                    </Badge>
                  </DataCell>
                  {view === "archived" && (
                    <DataCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(plan.archivedAt)}
                    </DataCell>
                  )}
                  {view === "trash" && (
                    <DataCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(plan.deletedAt)}
                    </DataCell>
                  )}
                  <DataCell align="right">
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Действия">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {/* Активный тариф */}
                          {view === "active" && (
                            <>
                              <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                                <Link href={`/admin/plans/${plan.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />Редактировать
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer"
                                onClick={() => setArchiveTarget(plan)}
                              >
                                <Archive className="h-3.5 w-3.5" />В архив
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setTrashTarget(plan)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />В корзину
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* Архивный тариф */}
                          {view === "archived" && (
                            <>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer"
                                disabled={restoringId === plan.id}
                                onClick={() => handleRestoreFromArchive(plan)}
                              >
                                {restoringId === plan.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <RotateCcw className="h-3.5 w-3.5" />}
                                Восстановить
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => setTrashTarget(plan)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />В корзину
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* Тариф в корзине */}
                          {view === "trash" && (
                            <>
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer"
                                disabled={restoringId === plan.id}
                                onClick={() => handleRestoreFromTrash(plan)}
                              >
                                {restoringId === plan.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <RotateCcw className="h-3.5 w-3.5" />}
                                Восстановить
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => { setPermanentTyped(""); setPermanentTarget(plan) }}
                              >
                                <Trash className="h-3.5 w-3.5" />Удалить навсегда
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableCard>

        {/* Диалог: В архив */}
        <Dialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Переместить в архив?</DialogTitle>
              <DialogDescription>
                Тариф «{archiveTarget?.name}» будет скрыт из активного списка. Из архива можно восстановить или отправить в корзину.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setArchiveTarget(null)} disabled={archiving}>Отмена</Button>
              <Button variant="secondary" size="sm" onClick={handleArchive} disabled={archiving} className="gap-1.5">
                {archiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}В архив
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Диалог: В корзину */}
        <Dialog open={!!trashTarget} onOpenChange={(o) => { if (!o) setTrashTarget(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Переместить в корзину?</DialogTitle>
              <DialogDescription>
                Тариф «{trashTarget?.name}» будет перемещён в корзину. Вы сможете восстановить его позже.
                {(trashTarget?.clientCount ?? 0) > 0 && (
                  <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                    Внимание: на этом тарифе {trashTarget?.clientCount} клиент{(trashTarget?.clientCount ?? 0) === 1 ? "" : "ов"}. После перемещения в корзину тариф станет недоступен для новых подписок.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setTrashTarget(null)} disabled={trashing}>Отмена</Button>
              <Button variant="destructive" size="sm" onClick={handleTrash} disabled={trashing} className="gap-1.5">
                {trashing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}В корзину
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Диалог: Удалить навсегда */}
        <Dialog open={!!permanentTarget} onOpenChange={(o) => { if (!o) { setPermanentTarget(null); setPermanentTyped("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />Удалить навсегда?
              </DialogTitle>
              <DialogDescription>
                Тариф «{permanentTarget?.name}» будет удалён без возможности восстановления.
                {(permanentTarget?.clientCount ?? 0) > 0
                  ? <span className="block mt-2 text-destructive font-medium">Удаление заблокировано: на тарифе {permanentTarget?.clientCount} клиент{(permanentTarget?.clientCount ?? 0) === 1 ? "" : "ов"}. Переведите их на другой тариф.</span>
                  : null
                }
              </DialogDescription>
            </DialogHeader>
            {(permanentTarget?.clientCount ?? 0) === 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-plan" className="text-xs">Введите название тарифа для подтверждения:</Label>
                <Input
                  id="confirm-plan"
                  value={permanentTyped}
                  onChange={e => setPermanentTyped(e.target.value)}
                  placeholder={permanentTarget?.name}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => { setPermanentTarget(null); setPermanentTyped("") }} disabled={permanentBusy}>
                {(permanentTarget?.clientCount ?? 0) > 0 ? "Закрыть" : "Отмена"}
              </Button>
              {(permanentTarget?.clientCount ?? 0) === 0 && (
                <Button variant="destructive" size="sm" onClick={handlePermanent} disabled={!permanentConfirmed || permanentBusy} className="gap-1.5">
                  {permanentBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}Удалить навсегда
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminPageLayout>
  )
}

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Загрузка...</div>}>
      <AdminPlansInner />
    </Suspense>
  )
}
