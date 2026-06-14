"use client"

import { Suspense } from "react"
import { useState, useEffect, useCallback, type CSSProperties } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Building2, Briefcase, Network, Plus, Pencil, Trash2, ChevronRight,
  Users, Crown, Loader2, UserPlus, ArrowLeft, ArrowRight, SlidersHorizontal, Check,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────

interface Department {
  id: string
  name: string
  description: string | null
  parentId: string | null
  parentName: string | null
  headUserId: string | null
  headUserName: string | null
  sortOrder: number | null
  createdAt: string
}

interface Position {
  id: string
  name: string
  description: string | null
  departmentId: string | null
  departmentName: string | null
  grade: string | null
  salaryMin: number | null
  salaryMax: number | null
  userId: string | null
  userName: string | null
  userAvatar: string | null
  // Вариант B: много сотрудников на должность.
  employees: { id: string; name: string; avatar: string | null }[]
  createdAt: string
}

interface TeamMember { id: string; name: string; avatarUrl: string | null }

// ─── Dept table helpers ──────────────────────────────────

type DeptNode = Department & { children: DeptNode[]; depth: number }

function buildDeptFlat(depts: Department[]): DeptNode[] {
  const map = new Map<string, DeptNode>()
  depts.forEach((d) => map.set(d.id, { ...d, children: [], depth: 0 }))

  const roots: DeptNode[] = []
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const flat: DeptNode[] = []
  function walk(nodes: DeptNode[], depth: number) {
    for (const n of nodes) {
      n.depth = depth
      flat.push(n)
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return flat
}

// ─── Salary helper ───────────────────────────────────────

function formatRubles(kopecks: number | null): string {
  if (kopecks == null) return "—"
  return (kopecks / 100).toLocaleString("ru-RU") + " ₽"
}

// ─── Org scheme tree types ───────────────────────────────

interface OrgTreeNode {
  dept: Department
  children: OrgTreeNode[]
  positions: Position[]
}

function buildOrgTree(depts: Department[], positions: Position[]): { roots: OrgTreeNode[]; unassigned: Position[] } {
  const nodeMap = new Map<string, OrgTreeNode>()
  depts.forEach((d) => nodeMap.set(d.id, { dept: d, children: [], positions: [] }))

  const unassigned: Position[] = []
  positions.forEach((p) => {
    if (p.departmentId && nodeMap.has(p.departmentId)) {
      nodeMap.get(p.departmentId)!.positions.push(p)
    } else {
      unassigned.push(p)
    }
  })

  const roots: OrgTreeNode[] = []
  nodeMap.forEach((node) => {
    if (node.dept.parentId && nodeMap.has(node.dept.parentId)) {
      nodeMap.get(node.dept.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return { roots, unassigned }
}

function getDescendantIds(deptId: string, allDepts: Department[]): Set<string> {
  const result = new Set<string>()
  const queue = [deptId]
  while (queue.length) {
    const current = queue.shift()!
    for (const d of allDepts) {
      if (d.parentId === current && !result.has(d.id)) {
        result.add(d.id)
        queue.push(d.id)
      }
    }
  }
  return result
}

// ─── Org scheme visual components ───────────────────────

type DragPayload = { type: "position"; id: string } | { type: "department"; id: string }

type OrgCallbacks = {
  onAddDept: (parentId: string | null) => void
  onEditDept: (dept: Department) => void
  onAddPos: (deptId: string) => void
  onEditPos: (pos: Position) => void
  onAssign: (pos: Position) => void
  onDragStartPos: (e: React.DragEvent, posId: string) => void
  onDragStartDept: (e: React.DragEvent, deptId: string) => void
  onDragOverDept: (e: React.DragEvent, deptId: string | null) => void
  onDragLeaveDept: () => void
  onDropOnDept: (e: React.DragEvent, deptId: string | null) => void
  dropTarget: string | null
  onSwapDept: (deptId: string, direction: "left" | "right") => void
  getSiblingIndex: (deptId: string) => { index: number; total: number }
  canEdit: boolean
}

// Мультивыбор сотрудников на должность (вариант B).
function EmployeeMultiSelect({ team, selected, onChange }: { team: TeamMember[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
      {team.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">Нет сотрудников в команде</div>
      )}
      {team.map((m) => {
        const on = selected.includes(m.id)
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-accent/50", on && "bg-primary/5")}
          >
            <span className={cn("flex items-center justify-center w-4 h-4 rounded border shrink-0", on ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
              {on && <Check className="w-3 h-3" />}
            </span>
            <span className="truncate flex-1">{m.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function PosRow({ pos, cb }: { pos: Position; cb: OrgCallbacks }) {
  return (
    <div
      draggable={cb.canEdit}
      onDragStart={(e) => { if (cb.canEdit) { cb.onDragStartPos(e, pos.id); e.stopPropagation() } }}
      className={cn(
        "flex items-start gap-2 py-1.5 px-2 rounded bg-muted/20 hover:bg-muted/40 transition-colors",
        cb.canEdit && "cursor-grab active:cursor-grabbing",
      )}
      onClick={() => cb.canEdit && cb.onEditPos(pos)}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-left truncate block">{pos.name}</span>
        {(() => {
          // Фолбэк на legacy userName, если employees ещё не пришёл.
          const emps = pos.employees ?? (pos.userName ? [{ id: pos.userId ?? "", name: pos.userName, avatar: pos.userAvatar }] : [])
          if (emps.length === 0) return <span className="text-xs text-muted-foreground/50 italic block">Вакантно</span>
          const label = emps.length === 1 ? emps[0].name : `${emps[0].name} +${emps.length - 1}`
          return <span className="text-xs text-muted-foreground truncate block" title={emps.map(e => e.name).join(", ")}>{label}</span>
        })()}
      </div>
      {cb.canEdit && (
        <button
          type="button"
          className="mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
          onClick={(e) => { e.stopPropagation(); cb.onAssign(pos) }}
          title={(pos.employees?.length ?? (pos.userName ? 1 : 0)) > 0 ? "Сотрудники на должности" : "Назначить сотрудников"}
        >
          <UserPlus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function ChildrenRow({ children: kids }: { children: React.ReactNode[] }) {
  if (kids.length === 0) return null
  return (
    <>
      <div className="w-0.5 h-7 bg-border mx-auto" />
      <div className="flex justify-center">
        {kids.map((child, i) => {
          const isFirst = i === 0
          const isLast = i === kids.length - 1
          const isOnly = kids.length === 1
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="flex self-stretch h-7">
                <div className={cn("flex-1 border-t-2 border-border", (isFirst || isOnly) && "border-t-0")} />
                <div className="w-0.5 bg-border shrink-0" />
                <div className={cn("flex-1 border-t-2 border-border", (isLast || isOnly) && "border-t-0")} />
              </div>
              <div className="px-2">{child}</div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Ширина берётся из CSS-переменной --org-card-w (задаётся на контейнере схемы,
// настраивается кнопкой «Настройки»); дефолт 230px.
function DeptCard({ node, cb }: { node: OrgTreeNode; cb: OrgCallbacks }) {
  const head = node.dept.headUserName
  const isDropTarget = cb.dropTarget === node.dept.id
  return (
    <div className="flex flex-col items-center">
      <div className="w-[var(--org-card-w,230px)]">
        <div
          className={cn(
            "rounded-xl border bg-card group relative transition-all hover:shadow-md hover:border-primary/50 overflow-hidden",
            isDropTarget && "border-dashed !border-primary bg-primary/5 shadow-lg",
          )}
          onDragOver={cb.canEdit ? (e) => { e.preventDefault(); cb.onDragOverDept(e, node.dept.id) } : undefined}
          onDragLeave={cb.canEdit ? () => cb.onDragLeaveDept() : undefined}
          onDrop={cb.canEdit ? (e) => cb.onDropOnDept(e, node.dept.id) : undefined}
        >
          {cb.canEdit && (
            <button
              type="button"
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
              onClick={() => cb.onAddDept(node.dept.id)}
              title="Добавить подотдел"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}

          {cb.canEdit && (() => {
            const { index, total } = cb.getSiblingIndex(node.dept.id)
            if (total <= 1) return null
            return (
              <div className="absolute top-1.5 left-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {index > 0 && (
                  <button type="button" className="w-5 h-5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground flex items-center justify-center shadow-sm transition-colors" onClick={() => cb.onSwapDept(node.dept.id, "left")} title="Влево">
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                {index < total - 1 && (
                  <button type="button" className="w-5 h-5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground flex items-center justify-center shadow-sm transition-colors" onClick={() => cb.onSwapDept(node.dept.id, "right")} title="Вправо">
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })()}

          <div
            draggable={cb.canEdit}
            onDragStart={cb.canEdit ? (e) => { cb.onDragStartDept(e, node.dept.id); e.stopPropagation() } : undefined}
            className={cn("px-3 pt-3 pb-2", cb.canEdit && "cursor-grab active:cursor-grabbing")}
            onClick={() => cb.canEdit && cb.onEditDept(node.dept)}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-bold leading-tight line-clamp-2 hover:text-primary transition-colors">{node.dept.name}</span>
              {cb.canEdit && <Pencil className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
            </div>
          </div>

          {head && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs">
                <Crown className="w-3 h-3 text-amber-500" />
                <span className="font-semibold truncate">{head}</span>
              </div>
            </>
          )}

          {node.positions.length > 0 && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <div className="px-2 py-2 space-y-1">
                {node.positions.map((pos) => (
                  <PosRow key={pos.id} pos={pos} cb={cb} />
                ))}
              </div>
            </>
          )}

          {cb.canEdit && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <button
                type="button"
                className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
                onClick={() => cb.onAddPos(node.dept.id)}
              >
                <Plus className="w-3 h-3" />Должность
              </button>
            </>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <ChildrenRow>
          {node.children.map((child) => (
            <DeptCard key={child.dept.id} node={child} cb={cb} />
          ))}
        </ChildrenRow>
      )}
    </div>
  )
}

function DeptCardMobile({ node, depth, cb }: { node: OrgTreeNode; depth: number; cb: OrgCallbacks }) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="rounded-lg border bg-card mb-2 group transition-all hover:shadow-sm hover:border-primary/40 overflow-hidden">
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <button
            type="button"
            className="text-sm font-bold flex-1 min-w-0 truncate text-left hover:text-primary transition-colors"
            onClick={() => cb.canEdit && cb.onEditDept(node.dept)}
          >
            {node.dept.name}
          </button>
          {cb.canEdit && (
            <button
              type="button"
              className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => cb.onAddDept(node.dept.id)}
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
        {node.dept.headUserName && (
          <>
            <div className="border-t border-border/50 mx-2" />
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs">
              <Crown className="w-3 h-3 text-amber-500" />
              <span className="font-semibold truncate">{node.dept.headUserName}</span>
            </div>
          </>
        )}
        {node.positions.length > 0 && (
          <>
            <div className="border-t border-border/50 mx-2" />
            <div className="px-2 py-2 space-y-1">
              {node.positions.map((pos) => (
                <PosRow key={pos.id} pos={pos} cb={cb} />
              ))}
            </div>
          </>
        )}
        {cb.canEdit && (
          <>
            <div className="border-t border-border/50 mx-2" />
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
              onClick={() => cb.onAddPos(node.dept.id)}
            >
              <Plus className="w-3 h-3" />Должность
            </button>
          </>
        )}
      </div>
      {node.children.map((child) => (
        <DeptCardMobile key={child.dept.id} node={child} depth={depth + 1} cb={cb} />
      ))}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────

type TabId = "departments" | "positions" | "scheme"

function CompanyStructureInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const tabParam = searchParams.get("tab") as TabId | null
  const activeTab: TabId = (tabParam === "positions" || tabParam === "scheme") ? tabParam : "departments"

  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [directorName, setDirectorName] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState("Компания")
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)

  // ── Department dialogs ──────────────────────────────────
  const [deptDialogOpen, setDeptDialogOpen] = useState(false)
  const [deptEditId, setDeptEditId] = useState<string | null>(null)
  const [deptForm, setDeptForm] = useState({ name: "", description: "", parentId: "", headUserId: "" })
  const [deptDeleteId, setDeptDeleteId] = useState<string | null>(null)
  const [deptSaving, setDeptSaving] = useState(false)

  // ── Position dialogs ────────────────────────────────────
  const [posDialogOpen, setPosDialogOpen] = useState(false)
  const [posEditId, setPosEditId] = useState<string | null>(null)
  const [posForm, setPosForm] = useState<{ name: string; departmentId: string; description: string; grade: string; salaryMin: string; salaryMax: string; employeeIds: string[] }>({ name: "", departmentId: "", description: "", grade: "", salaryMin: "", salaryMax: "", employeeIds: [] })
  const [posDeleteId, setPosDeleteId] = useState<string | null>(null)
  const [posSaving, setPosSaving] = useState(false)

  // Сортировка таблицы должностей (референсные иконки DataHeadCell)
  type PosSortCol = "name" | "department" | "grade" | "salary"
  const [posSort, setPosSort] = useState<{ column: PosSortCol; dir: "asc" | "desc" } | null>(null)
  const togglePosSort = (column: PosSortCol) =>
    setPosSort((p) => (!p || p.column !== column ? { column, dir: "asc" } : p.dir === "asc" ? { column, dir: "desc" } : null))

  // Сортировка таблицы отделов. При активной сортировке показываем плоский
  // отсортированный список (без дерева-отступов), иначе — иерархию.
  type DeptSortCol = "name" | "head" | "parent"
  const [deptSort, setDeptSort] = useState<{ column: DeptSortCol; dir: "asc" | "desc" } | null>(null)
  const toggleDeptSort = (column: DeptSortCol) =>
    setDeptSort((p) => (!p || p.column !== column ? { column, dir: "asc" } : p.dir === "asc" ? { column, dir: "desc" } : null))

  // Схема: настраиваемая ширина карточек отделов (px), сохраняется локально
  const [cardWidth, setCardWidth] = useState(230)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("orgCardWidth") : null
    if (saved) setCardWidth(Math.min(360, Math.max(180, parseInt(saved) || 230)))
  }, [])
  const applyCardWidth = (w: number) => {
    setCardWidth(w)
    if (typeof window !== "undefined") window.localStorage.setItem("orgCardWidth", String(w))
  }

  // ── Org scheme drag state ───────────────────────────────
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // ── Quick assign ────────────────────────────────────────
  const [asOpen, setAsOpen] = useState(false)
  const [asPos, setAsPos] = useState<Position | null>(null)
  const [asEmployeeIds, setAsEmployeeIds] = useState<string[]>([])
  const [asSaving, setAsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, posRes, compRes, teamRes, sessionRes] = await Promise.all([
        fetch("/api/modules/hr/departments"),
        fetch("/api/modules/hr/org/positions"),
        fetch("/api/companies"),
        fetch("/api/team"),
        fetch("/api/auth/session"),
      ])
      if (deptRes.ok) setDepartments(await deptRes.json())
      if (posRes.ok) setPositions(await posRes.json())
      if (compRes.ok) {
        const c = await compRes.json() as Record<string, unknown>
        if (typeof c.director === "string" && c.director) setDirectorName(c.director)
        const name = (c.brandName ?? c.name) as string | undefined
        if (name) setCompanyName(name)
      }
      if (teamRes.ok) setTeam(await teamRes.json())
      if (sessionRes.ok) {
        const session = await sessionRes.json() as { user?: { role?: string; permissions?: Record<string, boolean> } }
        const role = session?.user?.role ?? ""
        const perms = session?.user?.permissions ?? {}
        const isDirectorLike = ["director", "client", "platform_admin", "admin"].includes(role)
        const hasFlag = perms["manage_org_structure"] === true
        setCanEdit(isDirectorLike || hasFlag)
      }
    } catch {
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const setTab = (tab: TabId) => {
    router.replace(`/hr/company-structure?tab=${tab}`)
  }

  // ── Dept CRUD ───────────────────────────────────────────

  const openDeptCreate = (parentId?: string | null) => {
    setDeptEditId(null)
    setDeptForm({ name: "", description: "", parentId: parentId ?? "", headUserId: "" })
    setDeptDialogOpen(true)
  }

  const openDeptEdit = (dept: Department) => {
    setDeptEditId(dept.id)
    setDeptForm({
      name: dept.name,
      description: dept.description ?? "",
      parentId: dept.parentId ?? "",
      headUserId: dept.headUserId ?? "",
    })
    setDeptDialogOpen(true)
  }

  const handleDeptSave = async () => {
    if (!deptForm.name.trim()) { toast.error("Введите название отдела"); return }
    setDeptSaving(true)
    const payload = {
      name: deptForm.name.trim(),
      description: deptForm.description.trim() || null,
      parentId: deptForm.parentId && deptForm.parentId !== "none" ? deptForm.parentId : null,
      headUserId: deptForm.headUserId && deptForm.headUserId !== "none" ? deptForm.headUserId : null,
    }
    try {
      const url = deptEditId ? `/api/modules/hr/departments/${deptEditId}` : "/api/modules/hr/departments"
      const res = await fetch(url, {
        method: deptEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка сохранения"); return }
      toast.success(deptEditId ? "Отдел обновлён" : "Отдел создан")
      setDeptDialogOpen(false)
      await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setDeptSaving(false) }
  }

  const handleDeptDelete = async () => {
    if (!deptDeleteId) return
    try {
      const res = await fetch(`/api/modules/hr/departments/${deptDeleteId}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Ошибка удаления"); return }
      toast.success("Отдел удалён")
      setDeptDeleteId(null)
      await fetchData()
    } catch { toast.error("Ошибка сети") }
  }

  // ── Pos CRUD ────────────────────────────────────────────

  const openPosCreate = (deptId?: string) => {
    setPosEditId(null)
    setPosForm({ name: "", departmentId: deptId ?? "", description: "", grade: "", salaryMin: "", salaryMax: "", employeeIds: [] })
    setPosDialogOpen(true)
  }

  const openPosEdit = (pos: Position) => {
    setPosEditId(pos.id)
    setPosForm({
      name: pos.name,
      departmentId: pos.departmentId ?? "",
      description: pos.description ?? "",
      grade: pos.grade ?? "",
      salaryMin: pos.salaryMin != null ? String(pos.salaryMin / 100) : "",
      salaryMax: pos.salaryMax != null ? String(pos.salaryMax / 100) : "",
      employeeIds: (pos.employees ?? (pos.userId ? [{ id: pos.userId, name: pos.userName ?? "", avatar: null }] : [])).map(e => e.id),
    })
    setPosDialogOpen(true)
  }

  const handlePosSave = async () => {
    if (!posForm.name.trim()) { toast.error("Введите название должности"); return }
    setPosSaving(true)
    const payload = {
      name: posForm.name.trim(),
      departmentId: posForm.departmentId && posForm.departmentId !== "none" ? posForm.departmentId : null,
      description: posForm.description.trim() || null,
      grade: posForm.grade.trim() || null,
      salaryMin: posForm.salaryMin ? Math.round(parseFloat(posForm.salaryMin) * 100) : null,
      salaryMax: posForm.salaryMax ? Math.round(parseFloat(posForm.salaryMax) * 100) : null,
      employeeIds: posForm.employeeIds,
    }
    try {
      const url = posEditId ? `/api/modules/hr/org/positions/${posEditId}` : "/api/modules/hr/org/positions"
      const res = await fetch(url, {
        method: posEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка сохранения"); return }
      toast.success(posEditId ? "Должность обновлена" : "Должность создана")
      setPosDialogOpen(false)
      await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setPosSaving(false) }
  }

  const handlePosDelete = async () => {
    if (!posDeleteId) return
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${posDeleteId}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Ошибка удаления"); return }
      toast.success("Должность удалена")
      setPosDeleteId(null)
      await fetchData()
    } catch { toast.error("Ошибка сети") }
  }

  // ── Org scheme drag & drop ──────────────────────────────

  const handleDragStartPos = (e: React.DragEvent, posId: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "position", id: posId }))
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragStartDept = (e: React.DragEvent, deptId: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "department", id: deptId }))
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOverDept = (e: React.DragEvent, deptId: string | null) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(deptId)
  }

  const handleDragLeaveDept = () => setDropTarget(null)

  const handleDropOnDept = async (e: React.DragEvent, targetDeptId: string | null) => {
    e.preventDefault()
    setDropTarget(null)
    let payload: DragPayload
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload
    } catch { return }

    if (payload.type === "position") {
      const pos = positions.find(p => p.id === payload.id)
      if (!pos || (pos.departmentId ?? null) === targetDeptId) return
      const res = await fetch(`/api/modules/hr/org/positions/${payload.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: targetDeptId }),
      })
      if (res.ok) { toast.success("Должность перемещена"); await fetchData() }
      else toast.error("Ошибка перемещения")
    } else if (payload.type === "department") {
      if (payload.id === targetDeptId) return
      if (targetDeptId) {
        const descendants = getDescendantIds(payload.id, departments)
        if (descendants.has(targetDeptId)) { toast.error("Нельзя переместить отдел в свой подотдел"); return }
      }
      const dept = departments.find(d => d.id === payload.id)
      if (!dept || (dept.parentId ?? null) === targetDeptId) return
      const res = await fetch(`/api/modules/hr/departments/${payload.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: targetDeptId }),
      })
      if (res.ok) { toast.success("Отдел перемещён"); await fetchData() }
      else toast.error("Ошибка перемещения")
    }
  }

  const getSiblingIndex = (deptId: string): { index: number; total: number } => {
    const dept = departments.find(d => d.id === deptId)
    if (!dept) return { index: 0, total: 0 }
    const siblings = departments
      .filter(d => (d.parentId ?? null) === (dept.parentId ?? null))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    return { index: siblings.findIndex(d => d.id === deptId), total: siblings.length }
  }

  const handleSwapDept = async (deptId: string, direction: "left" | "right") => {
    const dept = departments.find(d => d.id === deptId)
    if (!dept) return
    const siblings = departments
      .filter(d => (d.parentId ?? null) === (dept.parentId ?? null))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const idx = siblings.findIndex(d => d.id === deptId)
    const swapIdx = direction === "left" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const other = siblings[swapIdx]
    await Promise.all([
      fetch(`/api/modules/hr/departments/${dept.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: other.sortOrder ?? 0 }),
      }),
      fetch(`/api/modules/hr/departments/${other.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: dept.sortOrder ?? 0 }),
      }),
    ])
    await fetchData()
  }

  const openAssign = (pos: Position) => {
    setAsPos(pos)
    setAsEmployeeIds((pos.employees ?? (pos.userId ? [{ id: pos.userId, name: pos.userName ?? "", avatar: null }] : [])).map(e => e.id))
    setAsOpen(true)
  }

  const handleAssign = async () => {
    if (!asPos) return
    setAsSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${asPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: asEmployeeIds }),
      })
      if (!res.ok) { toast.error("Ошибка назначения"); return }
      toast.success(asEmployeeIds.length ? "Сотрудники обновлены" : "Назначение снято")
      setAsOpen(false)
      await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setAsSaving(false) }
  }

  // ── Render ──────────────────────────────────────────────

  const deptFlat = buildDeptFlat(departments)
  // При активной сортировке — плоский отсортированный список (depth=0, без дерева).
  const deptRows = deptSort
    ? [...deptFlat]
        .map((d) => ({ ...d, depth: 0 }))
        .sort((a, b) => {
          const mul = deptSort.dir === "asc" ? 1 : -1
          switch (deptSort.column) {
            case "name":   return mul * a.name.localeCompare(b.name, "ru")
            case "head":   return mul * (a.headUserName ?? "").localeCompare(b.headUserName ?? "", "ru")
            case "parent": return mul * (a.parentName ?? "").localeCompare(b.parentName ?? "", "ru")
            default:       return 0
          }
        })
    : deptFlat
  const deptDir = (c: "name" | "head" | "parent") => (deptSort?.column === c ? deptSort.dir : null)
  const { roots, unassigned } = buildOrgTree(departments, positions)

  const orgCb: OrgCallbacks = {
    onAddDept: openDeptCreate, onEditDept: openDeptEdit,
    onAddPos: openPosCreate, onEditPos: openPosEdit,
    onAssign: openAssign,
    onDragStartPos: handleDragStartPos, onDragStartDept: handleDragStartDept,
    onDragOverDept: handleDragOverDept, onDragLeaveDept: handleDragLeaveDept,
    onDropOnDept: handleDropOnDept, dropTarget,
    onSwapDept: handleSwapDept, getSiblingIndex,
    canEdit,
  }

  const isRootDropTarget = dropTarget === "__root__"

  const rootBlock = (mobile: boolean) => (
    <div
      className={cn(
        "rounded-xl border-2 border-primary/30 bg-card shadow-md group relative transition-all hover:shadow-lg hover:border-primary/50 overflow-hidden",
        mobile ? "w-full" : "w-[var(--org-card-w,260px)]",
        isRootDropTarget && "border-dashed !border-primary bg-primary/5 shadow-lg",
      )}
      onDragOver={canEdit ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget("__root__") } : undefined}
      onDragLeave={canEdit ? () => setDropTarget(null) : undefined}
      onDrop={canEdit ? (e) => handleDropOnDept(e, null) : undefined}
    >
      {canEdit && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
          onClick={() => openDeptCreate(null)}
          title="Добавить отдел"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
      <div className="px-3 pt-3 pb-2 text-center">
        <div className="flex items-center justify-center gap-2 mb-0.5">
          <Crown className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">{companyName}</span>
        </div>
        {directorName && <p className="text-xs text-muted-foreground">Директор: {directorName}</p>}
        <p className="text-[10px] text-muted-foreground mt-0.5">{departments.length} отдел. · {positions.length} должн.</p>
      </div>
      {unassigned.length > 0 && (
        <>
          <div className="border-t border-primary/20 mx-2" />
          <div className="px-2 py-2 space-y-1">
            {unassigned.map((pos) => <PosRow key={pos.id} pos={pos} cb={orgCb} />)}
          </div>
        </>
      )}
      {canEdit && (
        <>
          <div className="border-t border-primary/20 mx-2" />
          <button type="button" className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5" onClick={() => openPosCreate("")}>
            <Plus className="w-3 h-3" />Должность
          </button>
        </>
      )}
    </div>
  )

  const TABS_DEF = [
    { key: "departments" as TabId, label: "Отделы",    icon: Building2 },
    { key: "positions"  as TabId, label: "Должности", icon: Briefcase },
    { key: "scheme"     as TabId, label: "Схема",     icon: Network },
  ]

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />

        {/* Шапка + таб-бар — стиль Рабочего стола */}
        <div className="border-b bg-background px-4 sm:px-14 pt-5 pb-0">
          <h1 className="text-lg font-semibold mb-3">Структура компании</h1>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-1">
              {TABS_DEF.map(({ key, label, icon: Icon }) => {
                const active = activeTab === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              })}
            </div>
            {activeTab === "scheme" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 mb-1.5 text-muted-foreground shrink-0">
                    <SlidersHorizontal className="w-4 h-4" /> Настройки
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Ширина карточек</Label>
                      <span className="text-xs text-muted-foreground tabular-nums">{cardWidth}px</span>
                    </div>
                    <Slider min={180} max={360} step={10} value={[cardWidth]} onValueChange={(v) => applyCardWidth(v[0])} />
                    <p className="text-xs text-muted-foreground">Регулирует ширину блоков отделов на схеме.</p>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">

            {/* ── Отделы ─────────────────────────────────────────── */}
            {activeTab === "departments" && (
              <div>
                <div className="flex justify-end mb-4">
                  {canEdit && (
                    <Button onClick={() => openDeptCreate()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить отдел
                    </Button>
                  )}
                </div>
                <TableCard>
                  <DataTable>
                    <DataHead>
                      <DataHeadCell sortable sortDir={deptDir("name")} onSort={() => toggleDeptSort("name")}>Название</DataHeadCell>
                      <DataHeadCell>Описание</DataHeadCell>
                      <DataHeadCell sortable sortDir={deptDir("head")} onSort={() => toggleDeptSort("head")}>Руководитель</DataHeadCell>
                      <DataHeadCell sortable sortDir={deptDir("parent")} onSort={() => toggleDeptSort("parent")}>Родительский отдел</DataHeadCell>
                      {canEdit && <DataHeadCell align="right">Действия</DataHeadCell>}
                    </DataHead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={canEdit ? 5 : 4} className="text-center py-12 text-muted-foreground">Загрузка...</td></tr>
                      ) : deptRows.length === 0 ? (
                        <tr><td colSpan={canEdit ? 5 : 4} className="text-center py-12 text-muted-foreground">Нет отделов</td></tr>
                      ) : (
                        deptRows.map((dept) => (
                          <DataRow key={dept.id}>
                            <DataCell>
                              <div className="flex items-center" style={{ marginLeft: dept.depth * 24 }}>
                                {dept.depth > 0 && (
                                  <ChevronRight className="h-3 w-3 text-muted-foreground mr-1.5 shrink-0" />
                                )}
                                <Building2 className="h-4 w-4 text-primary mr-2 shrink-0" />
                                <span className="font-medium">{dept.name}</span>
                              </div>
                            </DataCell>
                            <DataCell className="text-muted-foreground">{dept.description ?? "—"}</DataCell>
                            <DataCell>
                              {dept.headUserName ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Users className="h-3 w-3" />
                                  {dept.headUserName}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </DataCell>
                            <DataCell className="text-muted-foreground">{dept.parentName ?? "—"}</DataCell>
                            {canEdit && (
                              <DataCell align="right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDeptEdit(dept)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeptDeleteId(dept.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </DataCell>
                            )}
                          </DataRow>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </TableCard>
              </div>
            )}

            {/* ── Должности ──────────────────────────────────────── */}
            {activeTab === "positions" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Отдел:</Label>
                    <Select
                      value={searchParams.get("dept") ?? "all"}
                      onValueChange={(v) => router.replace(`/hr/company-structure?tab=positions&dept=${v}`)}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все отделы</SelectItem>
                        <SelectItem value="none">Без отдела</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {canEdit && (
                    <Button onClick={() => openPosCreate()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Добавить должность
                    </Button>
                  )}
                </div>

                {(() => {
                  const filterDept = searchParams.get("dept") ?? "all"
                  const filtered = filterDept === "all"
                    ? positions
                    : filterDept === "none"
                      ? positions.filter((p) => !p.departmentId)
                      : positions.filter((p) => p.departmentId === filterDept)

                  const sorted = posSort
                    ? [...filtered].sort((a, b) => {
                        const mul = posSort.dir === "asc" ? 1 : -1
                        switch (posSort.column) {
                          case "name":       return mul * a.name.localeCompare(b.name, "ru")
                          case "department": return mul * (a.departmentName ?? "").localeCompare(b.departmentName ?? "", "ru")
                          case "grade":      return mul * (a.grade ?? "").localeCompare(b.grade ?? "", "ru")
                          case "salary":     return mul * ((a.salaryMin ?? a.salaryMax ?? 0) - (b.salaryMin ?? b.salaryMax ?? 0))
                          default:           return 0
                        }
                      })
                    : filtered
                  const posDir = (c: PosSortCol) => (posSort?.column === c ? posSort.dir : null)

                  return (
                    <TableCard>
                      <DataTable>
                        <DataHead>
                          <DataHeadCell sortable sortDir={posDir("name")} onSort={() => togglePosSort("name")}>Название</DataHeadCell>
                          <DataHeadCell sortable sortDir={posDir("department")} onSort={() => togglePosSort("department")}>Отдел</DataHeadCell>
                          <DataHeadCell sortable sortDir={posDir("grade")} onSort={() => togglePosSort("grade")}>Грейд</DataHeadCell>
                          <DataHeadCell sortable sortDir={posDir("salary")} onSort={() => togglePosSort("salary")}>Зарплата</DataHeadCell>
                          {canEdit && <DataHeadCell align="right">Действия</DataHeadCell>}
                        </DataHead>
                        <tbody>
                          {loading ? (
                            <tr><td colSpan={canEdit ? 5 : 4} className="text-center py-12 text-muted-foreground">Загрузка...</td></tr>
                          ) : sorted.length === 0 ? (
                            <tr><td colSpan={canEdit ? 5 : 4} className="text-center py-12 text-muted-foreground">Нет должностей</td></tr>
                          ) : (
                            sorted.map((pos) => (
                              <DataRow key={pos.id}>
                                <DataCell>
                                  <div className="flex items-center gap-2">
                                    <Briefcase className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-medium">{pos.name}</span>
                                  </div>
                                </DataCell>
                                <DataCell className="text-muted-foreground">{pos.departmentName ?? "—"}</DataCell>
                                <DataCell>
                                  {pos.grade ? <Badge variant="outline">{pos.grade}</Badge> : <span className="text-muted-foreground">—</span>}
                                </DataCell>
                                <DataCell>
                                  {pos.salaryMin != null || pos.salaryMax != null ? (
                                    <span>{formatRubles(pos.salaryMin)} — {formatRubles(pos.salaryMax)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </DataCell>
                                {canEdit && (
                                  <DataCell align="right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPosEdit(pos)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setPosDeleteId(pos.id)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </DataCell>
                                )}
                              </DataRow>
                            ))
                          )}
                        </tbody>
                      </DataTable>
                    </TableCard>
                  )
                })()}
              </div>
            )}

            {/* ── Схема ──────────────────────────────────────────── */}
            {activeTab === "scheme" && (
              <div>
                {loading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
                  </div>
                ) : departments.length === 0 && positions.length === 0 ? (
                  <Card className="py-12">
                    <CardContent className="flex flex-col items-center text-center text-muted-foreground gap-3">
                      <p>Нет данных. {canEdit ? "Создайте первый отдел." : "Обратитесь к директору компании."}</p>
                      {canEdit && (
                        <Button size="sm" className="gap-1.5" onClick={() => openDeptCreate(null)}>
                          <Plus className="w-3.5 h-3.5" />Создать отдел
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto pb-8" style={{ "--org-card-w": `${cardWidth}px` } as CSSProperties}>
                      <div className="min-w-fit flex flex-col items-center">
                        {rootBlock(false)}
                        {roots.length > 0 && (
                          <ChildrenRow>
                            {roots.map((n) => <DeptCard key={n.dept.id} node={n} cb={orgCb} />)}
                          </ChildrenRow>
                        )}
                      </div>
                    </div>
                    <div className="md:hidden space-y-2">
                      <div className="mb-3">{rootBlock(true)}</div>
                      {roots.map((n) => <DeptCardMobile key={n.dept.id} node={n} depth={0} cb={orgCb} />)}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        </main>
      </SidebarInset>

      {/* ── Диалог создания/редактирования отдела ────────────── */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deptEditId ? "Редактировать отдел" : "Новый отдел"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                placeholder="Например: Отдел продаж"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleDeptSave()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                placeholder="Краткое описание отдела"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Родительский отдел</Label>
              <Select value={deptForm.parentId || "none"} onValueChange={(v) => setDeptForm({ ...deptForm, parentId: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Без родителя" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Верхний уровень —</SelectItem>
                  {departments
                    .filter((d) => d.id !== deptEditId)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Руководитель</Label>
              <Select value={deptForm.headUserId || "none"} onValueChange={(v) => setDeptForm({ ...deptForm, headUserId: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Не назначен" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не назначен —</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            {deptEditId && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => { setDeptDeleteId(deptEditId); setDeptDialogOpen(false) }}
              >
                <Trash2 className="h-3.5 w-3.5" />Удалить
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>Отмена</Button>
              <Button onClick={handleDeptSave} disabled={deptSaving}>
                {deptSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {deptEditId ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Подтверждение удаления отдела ─────────────────────── */}
      <Dialog open={!!deptDeleteId} onOpenChange={() => setDeptDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалить отдел?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Это действие нельзя отменить. Все дочерние отделы потеряют связь с родительским. Должности останутся, но потеряют привязку к отделу.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDeptDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог создания/редактирования должности ─────────── */}
      <Dialog open={posDialogOpen} onOpenChange={setPosDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{posEditId ? "Редактировать должность" : "Новая должность"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input
                value={posForm.name}
                onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                placeholder="Например: Менеджер по продажам"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handlePosSave()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Отдел</Label>
              <Select value={posForm.departmentId || "none"} onValueChange={(v) => setPosForm({ ...posForm, departmentId: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Без отдела" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Без отдела —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Input
                value={posForm.description}
                onChange={(e) => setPosForm({ ...posForm, description: e.target.value })}
                placeholder="Краткое описание"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Грейд</Label>
              <Input
                value={posForm.grade}
                onChange={(e) => setPosForm({ ...posForm, grade: e.target.value })}
                placeholder="Senior, Middle, Junior"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Зарплата от (₽)</Label>
                <Input type="number" value={posForm.salaryMin} onChange={(e) => setPosForm({ ...posForm, salaryMin: e.target.value })} placeholder="80 000" />
              </div>
              <div className="space-y-1.5">
                <Label>Зарплата до (₽)</Label>
                <Input type="number" value={posForm.salaryMax} onChange={(e) => setPosForm({ ...posForm, salaryMax: e.target.value })} placeholder="150 000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Сотрудники{posForm.employeeIds.length > 0 ? ` (${posForm.employeeIds.length})` : ""}</Label>
              <EmployeeMultiSelect team={team} selected={posForm.employeeIds} onChange={(ids) => setPosForm({ ...posForm, employeeIds: ids })} />
              <p className="text-xs text-muted-foreground">Можно выбрать несколько — на одной должности несколько сотрудников.</p>
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            {posEditId && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => { setPosDeleteId(posEditId); setPosDialogOpen(false) }}
              >
                <Trash2 className="h-3.5 w-3.5" />Удалить
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setPosDialogOpen(false)}>Отмена</Button>
              <Button onClick={handlePosSave} disabled={posSaving}>
                {posSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {posEditId ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Подтверждение удаления должности ──────────────────── */}
      <Dialog open={!!posDeleteId} onOpenChange={() => setPosDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалить должность?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Это действие нельзя отменить.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={handlePosDelete}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Быстрое назначение сотрудника ─────────────────────── */}
      <Dialog open={asOpen} onOpenChange={setAsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Сотрудники на должности</DialogTitle></DialogHeader>
          {asPos && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                Должность: <span className="font-medium text-foreground">{asPos.name}</span>
              </p>
              <div className="space-y-1.5">
                <Label>Сотрудники{asEmployeeIds.length > 0 ? ` (${asEmployeeIds.length})` : ""}</Label>
                <EmployeeMultiSelect team={team} selected={asEmployeeIds} onChange={setAsEmployeeIds} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAsOpen(false)}>Отмена</Button>
                <Button size="sm" onClick={handleAssign} disabled={asSaving}>
                  {asSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                  Сохранить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}

export default function CompanyStructurePage() {
  return (
    <Suspense>
      <CompanyStructureInner />
    </Suspense>
  )
}
