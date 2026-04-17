"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Building2, Briefcase, Network, Plus, Crown, Loader2, UserPlus, Trash2, Pencil, ArrowLeft, ArrowRight,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────
interface Department {
  id: string
  name: string
  description: string | null
  parentId: string | null
  headUserId: string | null
  headUserName: string | null
  sortOrder: number | null
}

interface Position {
  id: string
  name: string
  departmentId: string | null
  grade: string | null
  salaryMin: number | null
  salaryMax: number | null
  userId: string | null
  userName: string | null
  userAvatar: string | null
}

interface TeamMember { id: string; name: string; avatarUrl: string | null }

interface TreeNode {
  dept: Department
  children: TreeNode[]
  positions: Position[]
}

type DragPayload = { type: "position"; id: string } | { type: "department"; id: string }

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

type Callbacks = {
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
}

// ─── Tree builder ────────────────────────────────────────
function buildTree(depts: Department[], positions: Position[]): { roots: TreeNode[]; unassigned: Position[] } {
  const nodeMap = new Map<string, TreeNode>()
  depts.forEach((d) => nodeMap.set(d.id, { dept: d, children: [], positions: [] }))

  const unassigned: Position[] = []
  positions.forEach((p) => {
    if (p.departmentId && nodeMap.has(p.departmentId)) {
      nodeMap.get(p.departmentId)!.positions.push(p)
    } else {
      unassigned.push(p)
    }
  })

  const roots: TreeNode[] = []
  nodeMap.forEach((node) => {
    if (node.dept.parentId && nodeMap.has(node.dept.parentId)) {
      nodeMap.get(node.dept.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return { roots, unassigned }
}

// ─── Position row ────────────────────────────────────────
function PosRow({ pos, cb }: { pos: Position; cb: Callbacks }) {
  return (
    <div
      draggable
      onDragStart={(e) => { cb.onDragStartPos(e, pos.id); e.stopPropagation() }}
      className="flex items-start gap-2 py-1.5 px-2 rounded bg-muted/20 cursor-grab hover:bg-muted/40 transition-colors active:cursor-grabbing"
      onClick={() => cb.onEditPos(pos)}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-left truncate block">{pos.name}</span>
        {pos.userName ? (
          <span className="text-xs text-muted-foreground truncate block">{pos.userName}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic block">Вакантно</span>
        )}
      </div>
      <button
        type="button"
        className="mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
        onClick={(e) => { e.stopPropagation(); cb.onAssign(pos) }}
        title={pos.userName ? "Сменить сотрудника" : "Назначить сотрудника"}
      >
        <UserPlus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Connector lines ─────────────────────────────────────
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

// ─── Desktop department card ─────────────────────────────
function DeptCard({ node, cb }: { node: TreeNode; cb: Callbacks }) {
  const head = node.dept.headUserName
  const isDropTarget = cb.dropTarget === node.dept.id
  return (
    <div className="flex flex-col items-center">
      <div className="w-[230px]">
        <div
          className={cn(
            "rounded-xl border bg-card group relative transition-all hover:shadow-md hover:border-primary/50 overflow-hidden",
            isDropTarget && "border-dashed !border-primary bg-primary/5 shadow-lg",
          )}
          onDragOver={(e) => { e.preventDefault(); cb.onDragOverDept(e, node.dept.id) }}
          onDragLeave={() => cb.onDragLeaveDept()}
          onDrop={(e) => cb.onDropOnDept(e, node.dept.id)}
        >
          <button
            type="button"
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
            onClick={() => cb.onAddDept(node.dept.id)}
            title="Добавить подотдел"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* Стрелки ← → для смены порядка */}
          {(() => {
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

          {/* Название — кликабельное + draggable */}
          <div
            draggable
            onDragStart={(e) => { cb.onDragStartDept(e, node.dept.id); e.stopPropagation() }}
            className="px-3 pt-3 pb-2 cursor-grab active:cursor-grabbing"
            onClick={() => cb.onEditDept(node.dept)}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-bold leading-tight line-clamp-2 hover:text-primary transition-colors">{node.dept.name}</span>
              <Pencil className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          </div>

          {head && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs">
                <span>👑</span>
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

          <div className="border-t border-border/50 mx-2" />
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
            onClick={() => cb.onAddPos(node.dept.id)}
          >
            <Plus className="w-3 h-3" />Должность
          </button>
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

// ─── Mobile department card ──────────────────────────────
function DeptCardMobile({ node, depth, cb }: { node: TreeNode; depth: number; cb: Callbacks }) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="rounded-lg border bg-card mb-2 group transition-all hover:shadow-sm hover:border-primary/40 overflow-hidden">
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <button type="button" className="text-sm font-bold flex-1 min-w-0 truncate text-left hover:text-primary transition-colors" onClick={() => cb.onEditDept(node.dept)}>
            {node.dept.name}
          </button>
          <button
            type="button"
            className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={() => cb.onAddDept(node.dept.id)}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {node.dept.headUserName && (
          <>
            <div className="border-t border-border/50 mx-2" />
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs">
              <span>👑</span>
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
        <div className="border-t border-border/50 mx-2" />
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
          onClick={() => cb.onAddPos(node.dept.id)}
        >
          <Plus className="w-3 h-3" />Должность
        </button>
      </div>
      {node.children.map((child) => (
        <DeptCardMobile key={child.dept.id} node={child} depth={depth + 1} cb={cb} />
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────
export default function OrgStructurePage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [directorName, setDirectorName] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>("Компания")
  const [loading, setLoading] = useState(true)

  // Create department
  const [cdOpen, setCdOpen] = useState(false)
  const [cdParentId, setCdParentId] = useState<string | null>(null)
  const [cdName, setCdName] = useState("")
  const [cdDesc, setCdDesc] = useState("")
  const [cdSaving, setCdSaving] = useState(false)

  // Edit department
  const [edOpen, setEdOpen] = useState(false)
  const [edDept, setEdDept] = useState<Department | null>(null)
  const [edName, setEdName] = useState("")
  const [edDesc, setEdDesc] = useState("")
  const [edHeadUserId, setEdHeadUserId] = useState("")
  const [edParentId, setEdParentId] = useState("")
  const [edSaving, setEdSaving] = useState(false)
  const [edDeleting, setEdDeleting] = useState(false)

  // Create position
  const [cpOpen, setCpOpen] = useState(false)
  const [cpDeptId, setCpDeptId] = useState("")
  const [cpName, setCpName] = useState("")
  const [cpGrade, setCpGrade] = useState("")
  const [cpSalMin, setCpSalMin] = useState("")
  const [cpSalMax, setCpSalMax] = useState("")
  const [cpSaving, setCpSaving] = useState(false)

  // Edit position (full: name, grade, salary, dept, user)
  const [epOpen, setEpOpen] = useState(false)
  const [epPos, setEpPos] = useState<Position | null>(null)
  const [epName, setEpName] = useState("")
  const [epGrade, setEpGrade] = useState("")
  const [epSalMin, setEpSalMin] = useState("")
  const [epSalMax, setEpSalMax] = useState("")
  const [epDeptId, setEpDeptId] = useState("")
  const [epUserId, setEpUserId] = useState("")
  const [epSaving, setEpSaving] = useState(false)
  const [epDeleting, setEpDeleting] = useState(false)

  // Drag and drop
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Assign user (quick)
  const [asOpen, setAsOpen] = useState(false)
  const [asPos, setAsPos] = useState<Position | null>(null)
  const [asUserId, setAsUserId] = useState("")
  const [asSaving, setAsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, posRes, compRes, teamRes] = await Promise.all([
        fetch("/api/modules/hr/departments"),
        fetch("/api/modules/hr/org/positions"),
        fetch("/api/companies"),
        fetch("/api/team"),
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
    } catch {
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Callbacks ──────────────────────────────────────────
  const openCreateDept = (parentId: string | null) => {
    setCdParentId(parentId); setCdName(""); setCdDesc(""); setCdOpen(true)
  }
  const handleCreateDept = async () => {
    if (!cdName.trim()) { toast.error("Введите название"); return }
    setCdSaving(true)
    try {
      const res = await fetch("/api/modules/hr/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cdName.trim(), description: cdDesc.trim() || undefined, parentId: cdParentId || undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); return }
      toast.success("Отдел создан"); setCdOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setCdSaving(false) }
  }

  const openEditDept = (dept: Department) => {
    setEdDept(dept); setEdName(dept.name); setEdDesc(dept.description ?? "")
    setEdHeadUserId(dept.headUserId ?? "__none"); setEdParentId(dept.parentId ?? "__none")
    setEdOpen(true)
  }
  const handleEditDept = async () => {
    if (!edDept || !edName.trim()) { toast.error("Введите название"); return }
    setEdSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/departments/${edDept.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edName.trim(),
          description: edDesc.trim() || null,
          headUserId: edHeadUserId === "__none" ? null : edHeadUserId || null,
          parentId: edParentId === "__none" ? null : edParentId || null,
        }),
      })
      if (!res.ok) { toast.error("Ошибка сохранения"); return }
      toast.success("Отдел обновлён"); setEdOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEdSaving(false) }
  }
  const handleDeleteDept = async () => {
    if (!edDept) return
    setEdDeleting(true)
    try {
      const res = await fetch(`/api/modules/hr/departments/${edDept.id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Ошибка удаления"); return }
      toast.success("Отдел удалён"); setEdOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEdDeleting(false) }
  }

  const openCreatePos = (deptId: string) => {
    setCpDeptId(deptId); setCpName(""); setCpGrade(""); setCpSalMin(""); setCpSalMax(""); setCpOpen(true)
  }
  const handleCreatePos = async () => {
    if (!cpName.trim()) { toast.error("Введите название"); return }
    setCpSaving(true)
    try {
      const body: Record<string, unknown> = { name: cpName.trim() }
      if (cpDeptId) body.departmentId = cpDeptId
      if (cpGrade.trim()) body.grade = cpGrade.trim()
      if (cpSalMin) body.salaryMin = parseInt(cpSalMin) * 100
      if (cpSalMax) body.salaryMax = parseInt(cpSalMax) * 100
      const res = await fetch("/api/modules/hr/org/positions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); return }
      toast.success("Должность создана"); setCpOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setCpSaving(false) }
  }

  const openEditPos = (pos: Position) => {
    setEpPos(pos); setEpName(pos.name); setEpGrade(pos.grade ?? "")
    setEpSalMin(pos.salaryMin != null ? String(pos.salaryMin / 100) : "")
    setEpSalMax(pos.salaryMax != null ? String(pos.salaryMax / 100) : "")
    setEpDeptId(pos.departmentId ?? "__none"); setEpUserId(pos.userId ?? "__none")
    setEpOpen(true)
  }
  const handleEditPos = async () => {
    if (!epPos || !epName.trim()) { toast.error("Введите название"); return }
    setEpSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${epPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: epName.trim(),
          grade: epGrade.trim() || null,
          salaryMin: epSalMin ? parseInt(epSalMin) * 100 : null,
          salaryMax: epSalMax ? parseInt(epSalMax) * 100 : null,
          departmentId: epDeptId === "__none" ? null : epDeptId || null,
          userId: epUserId === "__none" ? null : epUserId || null,
        }),
      })
      if (!res.ok) { toast.error("Ошибка сохранения"); return }
      toast.success("Должность обновлена"); setEpOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEpSaving(false) }
  }
  const handleDeletePos = async () => {
    if (!epPos) return
    setEpDeleting(true)
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${epPos.id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Ошибка удаления"); return }
      toast.success("Должность удалена"); setEpOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEpDeleting(false) }
  }

  const openAssign = (pos: Position) => {
    setAsPos(pos); setAsUserId(pos.userId ?? ""); setAsOpen(true)
  }
  const handleAssign = async () => {
    if (!asPos) return
    setAsSaving(true)
    try {
      const uid = asUserId === "__none" ? null : (asUserId || null)
      const res = await fetch(`/api/modules/hr/org/positions/${asPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      })
      if (!res.ok) { toast.error("Ошибка назначения"); return }
      toast.success(uid ? "Сотрудник назначен" : "Назначение снято"); setAsOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setAsSaving(false) }
  }

  // ── Drag & Drop ─────────────────────────────────────────
  const handleDragStartPos = (e: React.DragEvent, posId: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "position", id: posId }))
    e.dataTransfer.effectAllowed = "move"
    ;(e.currentTarget as HTMLElement).style.opacity = "0.5"
    setTimeout(() => { (e.currentTarget as HTMLElement).style.opacity = "" }, 0)
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
      if (!pos) return
      if ((pos.departmentId ?? null) === targetDeptId) return
      try {
        const res = await fetch(`/api/modules/hr/org/positions/${payload.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ departmentId: targetDeptId }),
        })
        if (res.ok) { toast.success("Должность перемещена"); await fetchData() }
        else toast.error("Ошибка перемещения")
      } catch { toast.error("Ошибка сети") }
    } else if (payload.type === "department") {
      if (payload.id === targetDeptId) return
      if (targetDeptId) {
        const descendants = getDescendantIds(payload.id, departments)
        if (descendants.has(targetDeptId)) { toast.error("Нельзя переместить отдел в свой подотдел"); return }
      }
      const dept = departments.find(d => d.id === payload.id)
      if (!dept) return
      if ((dept.parentId ?? null) === targetDeptId) return
      try {
        const res = await fetch(`/api/modules/hr/departments/${payload.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: targetDeptId }),
        })
        if (res.ok) { toast.success("Отдел перемещён"); await fetchData() }
        else toast.error("Ошибка перемещения")
      } catch { toast.error("Ошибка сети") }
    }
  }

  // ── Sort order (arrows) ─────────────────────────────────
  const getSiblingIndex = (deptId: string): { index: number; total: number } => {
    const dept = departments.find(d => d.id === deptId)
    if (!dept) return { index: 0, total: 0 }
    const siblings = departments
      .filter(d => (d.parentId ?? null) === (dept.parentId ?? null))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const idx = siblings.findIndex(d => d.id === deptId)
    return { index: idx, total: siblings.length }
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
    const myOrder = dept.sortOrder ?? 0
    const otherOrder = other.sortOrder ?? 0
    try {
      await Promise.all([
        fetch(`/api/modules/hr/departments/${dept.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: otherOrder }),
        }),
        fetch(`/api/modules/hr/departments/${other.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: myOrder }),
        }),
      ])
      await fetchData()
    } catch { toast.error("Ошибка сортировки") }
  }

  const { roots, unassigned } = buildTree(departments, positions)
  const cb: Callbacks = {
    onAddDept: openCreateDept, onEditDept: openEditDept, onAddPos: openCreatePos,
    onEditPos: openEditPos, onAssign: openAssign,
    onDragStartPos: handleDragStartPos, onDragStartDept: handleDragStartDept,
    onDragOverDept: handleDragOverDept, onDragLeaveDept: handleDragLeaveDept,
    onDropOnDept: handleDropOnDept, dropTarget,
    onSwapDept: handleSwapDept, getSiblingIndex,
  }

  const isRootDropTarget = dropTarget === "__root__"
  const rootBlock = (mobile: boolean) => (
    <div
      className={cn(
        "rounded-xl border-2 border-primary/30 bg-card shadow-md group relative transition-all hover:shadow-lg hover:border-primary/50 overflow-hidden",
        mobile ? "w-full" : "w-[260px]",
        isRootDropTarget && "border-dashed !border-primary bg-primary/5 shadow-lg",
      )}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget("__root__") }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => handleDropOnDept(e, null)}
    >
      <button type="button" className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10" onClick={() => openCreateDept(null)} title="Добавить отдел"><Plus className="w-3 h-3" /></button>
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
            {unassigned.map((pos) => <PosRow key={pos.id} pos={pos} cb={cb} />)}
          </div>
        </>
      )}
      <div className="border-t border-primary/20 mx-2" />
      <button type="button" className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5" onClick={() => openCreatePos("")}><Plus className="w-3 h-3" />Должность</button>
    </div>
  )

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Network className="h-6 w-6 text-primary" />Оргструктура</h1>
              <p className="text-sm text-muted-foreground mt-1">Визуальное представление структуры компании</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Загрузка...</div>
            ) : departments.length === 0 && positions.length === 0 ? (
              <Card className="py-12"><CardContent className="flex flex-col items-center text-center text-muted-foreground gap-3"><p>Нет данных. Создайте первый отдел.</p><Button size="sm" className="gap-1.5" onClick={() => openCreateDept(null)}><Plus className="w-3.5 h-3.5" />Создать отдел</Button></CardContent></Card>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto pb-8">
                  <div className="min-w-fit flex flex-col items-center">
                    {rootBlock(false)}
                    {roots.length > 0 && <ChildrenRow>{roots.map((n) => <DeptCard key={n.dept.id} node={n} cb={cb} />)}</ChildrenRow>}
                  </div>
                </div>
                <div className="md:hidden space-y-2">
                  <div className="mb-3">{rootBlock(true)}</div>
                  {roots.map((n) => <DeptCardMobile key={n.dept.id} node={n} depth={0} cb={cb} />)}
                </div>
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* ─── Create department ─── */}
      <Dialog open={cdOpen} onOpenChange={setCdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{cdParentId ? `Подотдел в «${departments.find(d => d.id === cdParentId)?.name}»` : "Новый отдел"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>Название *</Label><Input value={cdName} onChange={(e) => setCdName(e.target.value)} placeholder="Отдел продаж" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateDept()} /></div>
            <div className="space-y-1.5"><Label>Описание</Label><Textarea value={cdDesc} onChange={(e) => setCdDesc(e.target.value)} placeholder="Чем занимается отдел..." rows={2} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCdOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreateDept} disabled={cdSaving || !cdName.trim()}>{cdSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Edit department ─── */}
      <Dialog open={edOpen} onOpenChange={setEdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Редактировать отдел</DialogTitle></DialogHeader>
          {edDept && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5"><Label>Название *</Label><Input value={edName} onChange={(e) => setEdName(e.target.value)} autoFocus /></div>
              <div className="space-y-1.5"><Label>Описание</Label><Textarea value={edDesc} onChange={(e) => setEdDesc(e.target.value)} rows={2} /></div>
              <div className="space-y-1.5">
                <Label>Руководитель</Label>
                <Select value={edHeadUserId} onValueChange={setEdHeadUserId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Не назначен" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Не назначен —</SelectItem>
                    {team.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Родительский отдел</Label>
                <Select value={edParentId} onValueChange={setEdParentId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Нет (верхний уровень)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Верхний уровень —</SelectItem>
                    {departments.filter(d => d.id !== edDept.id).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDeleteDept} disabled={edDeleting || edSaving}>{edDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Удалить</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEdOpen(false)}>Отмена</Button>
                  <Button size="sm" onClick={handleEditDept} disabled={edSaving || edDeleting || !edName.trim()}>{edSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Сохранить</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Create position ─── */}
      <Dialog open={cpOpen} onOpenChange={setCpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новая должность{cpDeptId ? ` в «${departments.find(d => d.id === cpDeptId)?.name}»` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>Название *</Label><Input value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="Менеджер по продажам" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreatePos()} /></div>
            <div className="space-y-1.5"><Label>Грейд</Label><Input value={cpGrade} onChange={(e) => setCpGrade(e.target.value)} placeholder="Senior, Middle..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Зарплата от (₽)</Label><Input type="number" value={cpSalMin} onChange={(e) => setCpSalMin(e.target.value)} placeholder="80 000" /></div>
              <div className="space-y-1.5"><Label>Зарплата до (₽)</Label><Input type="number" value={cpSalMax} onChange={(e) => setCpSalMax(e.target.value)} placeholder="150 000" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCpOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreatePos} disabled={cpSaving || !cpName.trim()}>{cpSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Edit position (full) ─── */}
      <Dialog open={epOpen} onOpenChange={setEpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Редактировать должность</DialogTitle></DialogHeader>
          {epPos && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5"><Label>Название *</Label><Input value={epName} onChange={(e) => setEpName(e.target.value)} autoFocus /></div>
              <div className="space-y-1.5"><Label>Грейд</Label><Input value={epGrade} onChange={(e) => setEpGrade(e.target.value)} placeholder="Senior, Middle..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Зарплата от (₽)</Label><Input type="number" value={epSalMin} onChange={(e) => setEpSalMin(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Зарплата до (₽)</Label><Input type="number" value={epSalMax} onChange={(e) => setEpSalMax(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Отдел</Label>
                <Select value={epDeptId} onValueChange={setEpDeptId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Без отдела" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Без отдела (корень) —</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Сотрудник</Label>
                <Select value={epUserId} onValueChange={setEpUserId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Не назначен" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Не назначен —</SelectItem>
                    {team.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDeletePos} disabled={epDeleting || epSaving}>{epDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Удалить</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEpOpen(false)}>Отмена</Button>
                  <Button size="sm" onClick={handleEditPos} disabled={epSaving || epDeleting || !epName.trim()}>{epSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Сохранить</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Quick assign ─── */}
      <Dialog open={asOpen} onOpenChange={setAsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Назначить сотрудника</DialogTitle></DialogHeader>
          {asPos && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">Должность: <span className="font-medium text-foreground">{asPos.name}</span></p>
              <div className="space-y-1.5">
                <Label>Сотрудник</Label>
                <Select value={asUserId} onValueChange={setAsUserId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Снять назначение —</SelectItem>
                    {team.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAsOpen(false)}>Отмена</Button>
                <Button size="sm" onClick={handleAssign} disabled={asSaving}>{asSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Назначить</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
