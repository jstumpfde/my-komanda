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
  Building2, Briefcase, Network, Plus, Crown, Loader2, UserPlus, Trash2,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────
interface Department {
  id: string
  name: string
  description: string | null
  parentId: string | null
  headUserName: string | null
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

// ─── Position row (shared between desktop & mobile) ─────
function PosRow({ pos, onAssign, onEdit }: { pos: Position; onAssign: (p: Position) => void; onEdit: (p: Position) => void }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded bg-muted/20">
      <div className="flex-1 min-w-0">
        <button type="button" className="text-xs font-semibold text-left truncate block w-full hover:text-primary transition-colors" onClick={() => onEdit(pos)} title="Редактировать">
          {pos.name}
        </button>
        {pos.userName ? (
          <span className="text-[10px] text-muted-foreground truncate block">{pos.userName}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 italic block">Вакантно</span>
        )}
      </div>
      <button
        type="button"
        className="mt-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
        onClick={() => onAssign(pos)}
        title={pos.userName ? "Сменить сотрудника" : "Назначить сотрудника"}
      >
        <UserPlus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Connector: children with CORRECT top-down lines ────
function ChildrenRow({ children: kids }: { children: React.ReactNode[] }) {
  if (kids.length === 0) return null
  return (
    <>
      {/* Vertical stem DOWN from parent */}
      <div className="w-0.5 h-7 bg-border mx-auto" />
      {/* Children row: horizontal bar at TOP, vertical stems DOWN to each child */}
      <div className="flex justify-center">
        {kids.map((child, i) => {
          const isFirst = i === 0
          const isLast = i === kids.length - 1
          const isOnly = kids.length === 1
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="flex self-stretch h-7">
                {/* Left half of horizontal bar */}
                <div className={cn("flex-1 border-t-2 border-border", (isFirst || isOnly) && "border-t-0")} />
                {/* Vertical stem down to child */}
                <div className="w-0.5 bg-border shrink-0" />
                {/* Right half of horizontal bar */}
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

// ─── Desktop: department card (always expanded) ─────────
function DeptCard({ node, onAddDept, onAddPos, onAssign, onEditPos }: {
  node: TreeNode
  onAddDept: (parentId: string) => void
  onAddPos: (deptId: string) => void
  onAssign: (pos: Position) => void
  onEditPos: (pos: Position) => void
}) {
  const head = node.dept.headUserName
  return (
    <div className="flex flex-col items-center">
      <div className="w-[230px]">
        <div className="rounded-xl border bg-card group relative transition-all hover:shadow-md hover:border-primary/50 overflow-hidden">
          {/* + подотдел */}
          <button
            type="button"
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
            onClick={() => onAddDept(node.dept.id)}
            title="Добавить подотдел"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* Название */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-bold leading-tight line-clamp-2">{node.dept.name}</span>
            </div>
          </div>

          {/* Руководитель */}
          {head && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs">
                <span>👑</span>
                <span className="font-semibold truncate">{head}</span>
              </div>
            </>
          )}

          {/* Должности */}
          {(node.positions.length > 0) && (
            <>
              <div className="border-t border-border/50 mx-2" />
              <div className="px-2 py-2 space-y-1">
                {node.positions.map((pos) => (
                  <PosRow key={pos.id} pos={pos} onAssign={onAssign} onEdit={onEditPos} />
                ))}
              </div>
            </>
          )}

          {/* + Должность */}
          <div className="border-t border-border/50 mx-2" />
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
            onClick={() => onAddPos(node.dept.id)}
          >
            <Plus className="w-3 h-3" />Должность
          </button>
        </div>
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <ChildrenRow>
          {node.children.map((child) => (
            <DeptCard key={child.dept.id} node={child} onAddDept={onAddDept} onAddPos={onAddPos} onAssign={onAssign} onEditPos={onEditPos} />
          ))}
        </ChildrenRow>
      )}
    </div>
  )
}

// ─── Mobile: department (always expanded, indent) ───────
function DeptCardMobile({ node, depth, onAddDept, onAddPos, onAssign, onEditPos }: {
  node: TreeNode; depth: number
  onAddDept: (parentId: string) => void
  onAddPos: (deptId: string) => void
  onAssign: (pos: Position) => void
  onEditPos: (pos: Position) => void
}) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="rounded-lg border bg-card mb-2 group transition-all hover:shadow-sm hover:border-primary/40 overflow-hidden">
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-bold flex-1 min-w-0 truncate">{node.dept.name}</span>
          <button
            type="button"
            className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={() => onAddDept(node.dept.id)}
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
                <PosRow key={pos.id} pos={pos} onAssign={onAssign} onEdit={onEditPos} />
              ))}
            </div>
          </>
        )}
        <div className="border-t border-border/50 mx-2" />
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
          onClick={() => onAddPos(node.dept.id)}
        >
          <Plus className="w-3 h-3" />Должность
        </button>
      </div>
      {node.children.map((child) => (
        <DeptCardMobile key={child.dept.id} node={child} depth={depth + 1} onAddDept={onAddDept} onAddPos={onAddPos} onAssign={onAssign} onEditPos={onEditPos} />
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

  const [deptOpen, setDeptOpen] = useState(false)
  const [deptParentId, setDeptParentId] = useState<string | null>(null)
  const [deptName, setDeptName] = useState("")
  const [deptDesc, setDeptDesc] = useState("")
  const [deptCreating, setDeptCreating] = useState(false)

  const [posModalOpen, setPosModalOpen] = useState(false)
  const [posDeptId, setPosDeptId] = useState<string>("")
  const [posName, setPosName] = useState("")
  const [posGrade, setPosGrade] = useState("")
  const [posSalaryMin, setPosSalaryMin] = useState("")
  const [posSalaryMax, setPosSalaryMax] = useState("")
  const [posCreating, setPosCreating] = useState(false)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignPos, setAssignPos] = useState<Position | null>(null)
  const [assignUserId, setAssignUserId] = useState<string>("")
  const [assigning, setAssigning] = useState(false)

  // Edit position modal
  const [editOpen, setEditOpen] = useState(false)
  const [editPos, setEditPos] = useState<Position | null>(null)
  const [editName, setEditName] = useState("")
  const [editGrade, setEditGrade] = useState("")
  const [editSalaryMin, setEditSalaryMin] = useState("")
  const [editSalaryMax, setEditSalaryMax] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [editDeleting, setEditDeleting] = useState(false)

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

  const openDeptModal = (parentId: string | null) => {
    setDeptParentId(parentId); setDeptName(""); setDeptDesc(""); setDeptOpen(true)
  }
  const handleCreateDept = async () => {
    if (!deptName.trim()) { toast.error("Введите название"); return }
    setDeptCreating(true)
    try {
      const res = await fetch("/api/modules/hr/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName.trim(), description: deptDesc.trim() || undefined, parentId: deptParentId || undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); return }
      toast.success("Отдел создан"); setDeptOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setDeptCreating(false) }
  }

  const openPosModal = (deptId: string) => {
    setPosDeptId(deptId); setPosName(""); setPosGrade(""); setPosSalaryMin(""); setPosSalaryMax(""); setPosModalOpen(true)
  }
  const handleCreatePos = async () => {
    if (!posName.trim()) { toast.error("Введите название"); return }
    setPosCreating(true)
    try {
      const body: Record<string, unknown> = { name: posName.trim() }
      if (posDeptId) body.departmentId = posDeptId
      if (posGrade.trim()) body.grade = posGrade.trim()
      if (posSalaryMin) body.salaryMin = parseInt(posSalaryMin) * 100
      if (posSalaryMax) body.salaryMax = parseInt(posSalaryMax) * 100
      const res = await fetch("/api/modules/hr/org/positions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); return }
      toast.success("Должность создана"); setPosModalOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setPosCreating(false) }
  }

  const openAssignModal = (pos: Position) => {
    setAssignPos(pos); setAssignUserId(pos.userId ?? ""); setAssignOpen(true)
  }
  const handleAssign = async () => {
    if (!assignPos) return
    setAssigning(true)
    try {
      const uid = assignUserId === "__none" ? null : (assignUserId || null)
      const res = await fetch(`/api/modules/hr/org/positions/${assignPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      })
      if (!res.ok) { toast.error("Ошибка назначения"); return }
      toast.success(uid ? "Сотрудник назначен" : "Назначение снято"); setAssignOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setAssigning(false) }
  }

  const openEditModal = (pos: Position) => {
    setEditPos(pos)
    setEditName(pos.name)
    setEditGrade(pos.grade ?? "")
    setEditSalaryMin(pos.salaryMin != null ? String(pos.salaryMin / 100) : "")
    setEditSalaryMax(pos.salaryMax != null ? String(pos.salaryMax / 100) : "")
    setEditOpen(true)
  }
  const handleEditSave = async () => {
    if (!editPos || !editName.trim()) { toast.error("Введите название"); return }
    setEditSaving(true)
    try {
      const body: Record<string, unknown> = { name: editName.trim() }
      body.grade = editGrade.trim() || null
      body.salaryMin = editSalaryMin ? parseInt(editSalaryMin) * 100 : null
      body.salaryMax = editSalaryMax ? parseInt(editSalaryMax) * 100 : null
      const res = await fetch(`/api/modules/hr/org/positions/${editPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { toast.error("Ошибка сохранения"); return }
      toast.success("Должность обновлена"); setEditOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEditSaving(false) }
  }
  const handleEditDelete = async () => {
    if (!editPos) return
    setEditDeleting(true)
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${editPos.id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Ошибка удаления"); return }
      toast.success("Должность удалена"); setEditOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setEditDeleting(false) }
  }

  const { roots, unassigned } = buildTree(departments, positions)
  const parentDeptName = deptParentId ? departments.find(d => d.id === deptParentId)?.name : null
  const posDeptName = posDeptId ? departments.find(d => d.id === posDeptId)?.name : null

  // Root block content (company + unassigned positions)
  const rootBlock = (mobile: boolean) => (
    <div className={cn(
      "rounded-xl border-2 border-primary/30 bg-card shadow-md group relative transition-all hover:shadow-lg hover:border-primary/50 overflow-hidden",
      mobile ? "w-full" : "w-[260px]",
    )}>
      {/* + отдел */}
      <button
        type="button"
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
        onClick={() => openDeptModal(null)}
        title="Добавить отдел"
      >
        <Plus className="w-3 h-3" />
      </button>

      {/* Компания */}
      <div className="px-3 pt-3 pb-2 text-center">
        <div className="flex items-center justify-center gap-2 mb-0.5">
          <Crown className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">{companyName}</span>
        </div>
        {directorName && <p className="text-xs text-muted-foreground">Директор: {directorName}</p>}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {departments.length} отдел. · {positions.length} должн.
        </p>
      </div>

      {/* Должности без отдела */}
      {unassigned.length > 0 && (
        <>
          <div className="border-t border-primary/20 mx-2" />
          <div className="px-2 py-2 space-y-1">
            {unassigned.map((pos) => (
              <PosRow key={pos.id} pos={pos} onAssign={openAssignModal} onEdit={openEditModal} />
            ))}
          </div>
        </>
      )}

      {/* + Должность (корневая, без отдела) */}
      <div className="border-t border-primary/20 mx-2" />
      <button
        type="button"
        className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors py-1.5"
        onClick={() => openPosModal("")}
      >
        <Plus className="w-3 h-3" />Должность
      </button>
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
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Network className="h-6 w-6 text-primary" />
                Оргструктура
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Визуальное представление структуры компании</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
              </div>
            ) : departments.length === 0 && positions.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center text-center text-muted-foreground gap-3">
                  <p>Нет данных. Создайте первый отдел.</p>
                  <Button size="sm" className="gap-1.5" onClick={() => openDeptModal(null)}>
                    <Plus className="w-3.5 h-3.5" />Создать отдел
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* ═══ Desktop ═══ */}
                <div className="hidden md:block overflow-x-auto pb-8">
                  <div className="min-w-fit flex flex-col items-center">
                    {rootBlock(false)}
                    {roots.length > 0 && (
                      <ChildrenRow>
                        {roots.map((node) => (
                          <DeptCard key={node.dept.id} node={node} onAddDept={openDeptModal} onAddPos={openPosModal} onAssign={openAssignModal} onEditPos={openEditModal} />
                        ))}
                      </ChildrenRow>
                    )}
                  </div>
                </div>

                {/* ═══ Mobile ═══ */}
                <div className="md:hidden space-y-2">
                  <div className="mb-3">{rootBlock(true)}</div>
                  {roots.map((node) => (
                    <DeptCardMobile key={node.dept.id} node={node} depth={0} onAddDept={openDeptModal} onAddPos={openPosModal} onAssign={openAssignModal} onEditPos={openEditModal} />
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* Create department */}
      <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{parentDeptName ? `Подотдел в «${parentDeptName}»` : "Новый отдел"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Отдел продаж" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateDept()} />
            </div>
            <div className="space-y-1.5">
              <Label>Описание</Label>
              <Textarea value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} placeholder="Чем занимается отдел..." rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeptOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreateDept} disabled={deptCreating || !deptName.trim()}>
                {deptCreating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create position */}
      <Dialog open={posModalOpen} onOpenChange={setPosModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новая должность{posDeptName ? ` в «${posDeptName}»` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={posName} onChange={(e) => setPosName(e.target.value)} placeholder="Менеджер по продажам" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreatePos()} />
            </div>
            <div className="space-y-1.5">
              <Label>Грейд</Label>
              <Input value={posGrade} onChange={(e) => setPosGrade(e.target.value)} placeholder="Senior, Middle..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Зарплата от (₽)</Label>
                <Input type="number" value={posSalaryMin} onChange={(e) => setPosSalaryMin(e.target.value)} placeholder="80 000" />
              </div>
              <div className="space-y-1.5">
                <Label>Зарплата до (₽)</Label>
                <Input type="number" value={posSalaryMax} onChange={(e) => setPosSalaryMax(e.target.value)} placeholder="150 000" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPosModalOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreatePos} disabled={posCreating || !posName.trim()}>
                {posCreating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit position */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Редактировать должность</DialogTitle></DialogHeader>
          {editPos && (
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Название *</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && handleEditSave()} />
              </div>
              <div className="space-y-1.5">
                <Label>Грейд</Label>
                <Input value={editGrade} onChange={(e) => setEditGrade(e.target.value)} placeholder="Senior, Middle..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Зарплата от (₽)</Label>
                  <Input type="number" value={editSalaryMin} onChange={(e) => setEditSalaryMin(e.target.value)} placeholder="80 000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Зарплата до (₽)</Label>
                  <Input type="number" value={editSalaryMax} onChange={(e) => setEditSalaryMax(e.target.value)} placeholder="150 000" />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleEditDelete} disabled={editDeleting || editSaving}>
                  {editDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Удалить
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Отмена</Button>
                  <Button size="sm" onClick={handleEditSave} disabled={editSaving || editDeleting || !editName.trim()}>
                    {editSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Сохранить
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign user */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Назначить сотрудника</DialogTitle></DialogHeader>
          {assignPos && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">Должность: <span className="font-medium text-foreground">{assignPos.name}</span></p>
              <div className="space-y-1.5">
                <Label>Сотрудник</Label>
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Снять назначение —</SelectItem>
                    {team.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>Отмена</Button>
                <Button size="sm" onClick={handleAssign} disabled={assigning}>
                  {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Назначить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
