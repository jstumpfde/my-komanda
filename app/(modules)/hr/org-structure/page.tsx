"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
  Building2, Briefcase, ChevronDown, ChevronRight, Network,
  Users, Plus, Crown, Loader2, UserPlus,
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

interface TeamMember {
  id: string
  name: string
  avatarUrl: string | null
}

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

// ─── Connector: children row with real div lines ────────
function ChildrenRow({ children }: { children: React.ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <>
      {/* Vertical stem from parent down */}
      <div className="w-0.5 h-7 bg-border mx-auto" />
      {/* Row of children with horizontal connector */}
      <div className="flex justify-center">
        {children.map((child, i) => {
          const isFirst = i === 0
          const isLast = i === children.length - 1
          const isOnly = children.length === 1
          return (
            <div key={i} className="flex flex-col items-center">
              {/* Horizontal bar segment + vertical stem to child */}
              <div className="flex self-stretch h-7">
                <div className={cn("flex-1 border-b-2 border-border", (isFirst || isOnly) && "border-b-0")} />
                <div className="w-0.5 bg-border shrink-0" />
                <div className={cn("flex-1 border-b-2 border-border", (isLast || isOnly) && "border-b-0")} />
              </div>
              <div className="px-2">
                {child}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Desktop org-chart node ─────────────────────────────
function OrgNodeDesktop({ node, onAddDept, onAddPos, onAssign }: {
  node: TreeNode
  onAddDept: (parentId: string) => void
  onAddPos: (deptId: string) => void
  onAssign: (pos: Position) => void
}) {
  const [posOpen, setPosOpen] = useState(false)
  const posCount = node.positions.length

  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <div className="w-[220px]">
        <div
          className="rounded-xl border bg-card p-3 text-center group relative transition-all hover:shadow-md hover:border-primary/50 cursor-pointer"
          onClick={() => posCount > 0 && setPosOpen(!posOpen)}
        >
          <button
            type="button"
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
            onClick={(e) => { e.stopPropagation(); onAddDept(node.dept.id) }}
            title="Добавить подотдел"
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-sm font-semibold leading-tight line-clamp-2">{node.dept.name}</span>
          </div>
          {node.dept.headUserName && (
            <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
              <Users className="w-3 h-3" />{node.dept.headUserName}
            </p>
          )}
          {posCount > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center justify-center gap-0.5">
              <Briefcase className="w-3 h-3" />{posCount} должн.
              {posOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </div>
          )}
          {posOpen && (
            <div className="mt-2 space-y-1 text-left border-t pt-2" onClick={(e) => e.stopPropagation()}>
              {node.positions.map((pos) => (
                <div key={pos.id} className="flex items-center gap-1.5 text-xs py-1">
                  <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{pos.name}</span>
                  {pos.userName ? (
                    <span className="text-[10px] text-primary font-medium truncate max-w-[70px]">{pos.userName}</span>
                  ) : (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => onAssign(pos)}
                      title="Назначить сотрудника"
                    >
                      <UserPlus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors pt-1"
                onClick={() => onAddPos(node.dept.id)}
              >
                <Plus className="w-3 h-3" />Должность
              </button>
            </div>
          )}
          {!posOpen && (
            <button
              type="button"
              className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors mx-auto"
              onClick={(e) => { e.stopPropagation(); onAddPos(node.dept.id) }}
            >
              <Plus className="w-3 h-3" />Должность
            </button>
          )}
        </div>
      </div>
      {/* Children with connector lines */}
      {node.children.length > 0 && (
        <ChildrenRow>
          {node.children.map((child) => (
            <OrgNodeDesktop
              key={child.dept.id}
              node={child}
              onAddDept={onAddDept}
              onAddPos={onAddPos}
              onAssign={onAssign}
            />
          ))}
        </ChildrenRow>
      )}
    </div>
  )
}

// ─── Mobile list node ───────────────────────────────────
function OrgNodeMobile({ node, depth, onAddDept, onAddPos, onAssign }: {
  node: TreeNode; depth: number
  onAddDept: (parentId: string) => void
  onAddPos: (deptId: string) => void
  onAssign: (pos: Position) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0 || node.positions.length > 0

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="rounded-lg border bg-card p-3 mb-2 group transition-all hover:shadow-sm hover:border-primary/40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded transition-colors shrink-0"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : <span className="w-4" />}
          </button>
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium flex-1 min-w-0 truncate">{node.dept.name}</span>
          {node.dept.headUserName && (
            <Badge variant="secondary" className="gap-1 text-[10px] shrink-0">
              <Users className="h-2.5 w-2.5" />{node.dept.headUserName}
            </Badge>
          )}
          <button
            type="button"
            className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={() => onAddDept(node.dept.id)}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {expanded && (
          <div className="mt-2 ml-6 space-y-1">
            {node.positions.map((pos) => (
              <div key={pos.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30 text-xs">
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{pos.name}</span>
                {pos.userName ? (
                  <span className="text-[10px] text-primary font-medium truncate max-w-[80px]">{pos.userName}</span>
                ) : (
                  <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => onAssign(pos)}>
                    <UserPlus className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-1"
              onClick={() => onAddPos(node.dept.id)}
            >
              <Plus className="w-3 h-3" />Должность
            </button>
          </div>
        )}
      </div>
      {expanded && node.children.map((child) => (
        <OrgNodeMobile key={child.dept.id} node={child} depth={depth + 1} onAddDept={onAddDept} onAddPos={onAddPos} onAssign={onAssign} />
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

  // Create department modal
  const [deptOpen, setDeptOpen] = useState(false)
  const [deptParentId, setDeptParentId] = useState<string | null>(null)
  const [deptName, setDeptName] = useState("")
  const [deptDesc, setDeptDesc] = useState("")
  const [deptCreating, setDeptCreating] = useState(false)

  // Create position modal
  const [posOpen, setPosOpen] = useState(false)
  const [posDeptId, setPosDeptId] = useState<string>("")
  const [posName, setPosName] = useState("")
  const [posGrade, setPosGrade] = useState("")
  const [posSalaryMin, setPosSalaryMin] = useState("")
  const [posSalaryMax, setPosSalaryMax] = useState("")
  const [posCreating, setPosCreating] = useState(false)

  // Assign user modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignPos, setAssignPos] = useState<Position | null>(null)
  const [assignUserId, setAssignUserId] = useState<string>("")
  const [assigning, setAssigning] = useState(false)

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

  // ── Handlers ──
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
    setPosDeptId(deptId); setPosName(""); setPosGrade(""); setPosSalaryMin(""); setPosSalaryMax(""); setPosOpen(true)
  }
  const handleCreatePos = async () => {
    if (!posName.trim()) { toast.error("Введите название"); return }
    setPosCreating(true)
    try {
      const body: Record<string, unknown> = { name: posName.trim(), departmentId: posDeptId || undefined }
      if (posGrade.trim()) body.grade = posGrade.trim()
      if (posSalaryMin) body.salaryMin = parseInt(posSalaryMin) * 100
      if (posSalaryMax) body.salaryMax = parseInt(posSalaryMax) * 100
      const res = await fetch("/api/modules/hr/org/positions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast.error(d.error ?? "Ошибка"); return }
      toast.success("Должность создана"); setPosOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setPosCreating(false) }
  }

  const openAssignModal = (pos: Position) => {
    setAssignPos(pos); setAssignUserId(pos.userId ?? ""); setAssignOpen(true)
  }
  const handleAssign = async () => {
    if (!assignPos) return
    setAssigning(true)
    try {
      const res = await fetch(`/api/modules/hr/org/positions/${assignPos.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId || null }),
      })
      if (!res.ok) { toast.error("Ошибка назначения"); return }
      toast.success(assignUserId ? "Сотрудник назначен" : "Назначение снято"); setAssignOpen(false); await fetchData()
    } catch { toast.error("Ошибка сети") } finally { setAssigning(false) }
  }

  const { roots, unassigned } = buildTree(departments, positions)
  const parentDeptName = deptParentId ? departments.find(d => d.id === deptParentId)?.name : null
  const posDeptName = posDeptId ? departments.find(d => d.id === posDeptId)?.name : null

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
                    {/* Root node */}
                    <div className="w-[240px] rounded-xl border-2 border-primary/30 bg-card shadow-md p-4 text-center group relative transition-all hover:shadow-lg hover:border-primary/50">
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                        onClick={() => openDeptModal(null)}
                        title="Добавить отдел"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Crown className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold">{companyName}</span>
                      </div>
                      {directorName && <p className="text-xs text-muted-foreground">Директор: {directorName}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {departments.length} отдел. · {positions.length} должн.
                      </p>
                    </div>

                    {/* Tree with real div connector lines */}
                    {roots.length > 0 && (
                      <ChildrenRow>
                        {roots.map((node) => (
                          <OrgNodeDesktop key={node.dept.id} node={node} onAddDept={openDeptModal} onAddPos={openPosModal} onAssign={openAssignModal} />
                        ))}
                      </ChildrenRow>
                    )}
                  </div>

                  {/* Unassigned positions */}
                  {unassigned.length > 0 && (
                    <div className="mt-6 max-w-md mx-auto">
                      <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                          <Briefcase className="w-3.5 h-3.5" />Без отдела ({unassigned.length})
                        </p>
                        <div className="space-y-1">
                          {unassigned.map((pos) => (
                            <div key={pos.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-card">
                              <span className="truncate flex-1">{pos.name}</span>
                              {pos.userName ? (
                                <span className="text-[10px] text-primary font-medium">{pos.userName}</span>
                              ) : (
                                <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => openAssignModal(pos)}>
                                  <UserPlus className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ Mobile ═══ */}
                <div className="md:hidden space-y-2">
                  <div className="rounded-lg border-2 border-primary/30 bg-card p-3 mb-3 group relative">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-primary" />
                      <span className="text-sm font-bold">{companyName}</span>
                      <button
                        type="button"
                        className="ml-auto w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => openDeptModal(null)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {directorName && <p className="text-xs text-muted-foreground ml-6">Директор: {directorName}</p>}
                  </div>
                  {roots.map((node) => (
                    <OrgNodeMobile key={node.dept.id} node={node} depth={0} onAddDept={openDeptModal} onAddPos={openPosModal} onAssign={openAssignModal} />
                  ))}
                  {unassigned.length > 0 && (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 mt-4">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Briefcase className="w-3.5 h-3.5" />Без отдела ({unassigned.length})
                      </p>
                      <div className="space-y-1">
                        {unassigned.map((pos) => (
                          <div key={pos.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-card">
                            <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{pos.name}</span>
                            {pos.userName ? (
                              <span className="text-[10px] text-primary font-medium">{pos.userName}</span>
                            ) : (
                              <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => openAssignModal(pos)}>
                                <UserPlus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </SidebarInset>

      {/* ─── Create department ─── */}
      <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{parentDeptName ? `Подотдел в «${parentDeptName}»` : "Новый отдел"}</DialogTitle>
          </DialogHeader>
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

      {/* ─── Create position ─── */}
      <Dialog open={posOpen} onOpenChange={setPosOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая должность{posDeptName ? ` в «${posDeptName}»` : ""}</DialogTitle>
          </DialogHeader>
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
              <Button variant="outline" size="sm" onClick={() => setPosOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreatePos} disabled={posCreating || !posName.trim()}>
                {posCreating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Assign user to position ─── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Назначить сотрудника</DialogTitle>
          </DialogHeader>
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
                <Button size="sm" onClick={() => { if (assignUserId === "__none") { setAssignUserId(""); } handleAssign() }} disabled={assigning}>
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
