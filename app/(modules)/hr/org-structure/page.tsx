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
import { toast } from "sonner"
import {
  Building2, Briefcase, ChevronDown, ChevronRight, Network,
  Users, Plus, Crown, Loader2,
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
}

interface TreeNode {
  dept: Department
  children: TreeNode[]
  positions: Position[]
}

function formatRubles(kopecks: number | null): string {
  if (kopecks == null) return ""
  return (kopecks / 100).toLocaleString("ru-RU") + " \u20BD"
}

function salaryRange(pos: Position): string {
  if (pos.salaryMin == null && pos.salaryMax == null) return ""
  return `${formatRubles(pos.salaryMin)} — ${formatRubles(pos.salaryMax)}`
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

// ─── Connector CSS ──────────────────────────────────────
const TREE_CSS = `
/* Vertical stem from root down to first level */
.org-root-stem {
  width: 2px;
  height: 28px;
  background: hsl(var(--border));
  margin: 0 auto;
}
/* Children row */
.org-tree ul {
  display: flex;
  justify-content: center;
  padding-top: 28px;
  position: relative;
  list-style: none;
  margin: 0;
  padding-left: 0;
}
/* Vertical stem from parent node down to children row */
.org-tree ul::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 28px;
  border-left: 2px solid hsl(var(--border));
}
/* Each child node */
.org-tree li {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: 28px 10px 0;
}
/* Horizontal bar connecting siblings at top */
.org-tree li::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  border-top: 2px solid hsl(var(--border));
}
/* Vertical stem from horizontal bar down to node card */
.org-tree li::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 28px;
  border-left: 2px solid hsl(var(--border));
}
/* First child: horizontal bar starts at center */
.org-tree li:first-child::before { left: 50%; }
/* Last child: horizontal bar ends at center */
.org-tree li:last-child::before { right: 50%; }
/* Only child: no horizontal bar (just vertical) */
.org-tree li:only-child::before { display: none; }
`

// ─── Desktop org-chart node ─────────────────────────────
function OrgNodeDesktop({ node, onAdd }: { node: TreeNode; onAdd: (parentId: string) => void }) {
  const [posOpen, setPosOpen] = useState(false)
  const posCount = node.positions.length

  return (
    <li>
      <div className="w-[210px]">
        <div
          className="rounded-xl border bg-card p-3 text-center group relative transition-all hover:shadow-md hover:border-primary/50 cursor-pointer"
          onClick={() => posCount > 0 && setPosOpen(!posOpen)}
        >
          <button
            type="button"
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            onClick={(e) => { e.stopPropagation(); onAdd(node.dept.id) }}
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
          {posOpen && posCount > 0 && (
            <div className="mt-2 space-y-1 text-left border-t pt-2">
              {node.positions.map((pos) => (
                <div key={pos.id} className="flex items-center gap-1.5 text-xs py-0.5">
                  <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{pos.name}</span>
                  {pos.grade && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0">{pos.grade}</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgNodeDesktop key={child.dept.id} node={child} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─── Mobile list node (recursive) ───────────────────────
function OrgNodeMobile({ node, depth, onAdd }: { node: TreeNode; depth: number; onAdd: (parentId: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0 || node.positions.length > 0

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="rounded-lg border bg-card p-3 mb-2 group">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded transition-colors shrink-0"
            disabled={!hasChildren}
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <span className="w-4" />
            )}
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
            onClick={() => onAdd(node.dept.id)}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        {expanded && node.positions.length > 0 && (
          <div className="mt-2 ml-6 space-y-1">
            {node.positions.map((pos) => (
              <div key={pos.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30 text-xs">
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{pos.name}</span>
                {pos.grade && <Badge variant="outline" className="text-[9px] px-1 py-0">{pos.grade}</Badge>}
                {salaryRange(pos) && <span className="text-muted-foreground shrink-0">{salaryRange(pos)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {expanded && node.children.map((child) => (
        <OrgNodeMobile key={child.dept.id} node={child} depth={depth + 1} onAdd={onAdd} />
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────
export default function OrgStructurePage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [directorName, setDirectorName] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>("Компания")
  const [loading, setLoading] = useState(true)

  // ── Create department modal ──
  const [createOpen, setCreateOpen] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [createName, setCreateName] = useState("")
  const [createDesc, setCreateDesc] = useState("")
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, posRes, compRes] = await Promise.all([
        fetch("/api/modules/hr/departments"),
        fetch("/api/modules/hr/org/positions"),
        fetch("/api/companies"),
      ])
      if (deptRes.ok) setDepartments(await deptRes.json())
      if (posRes.ok) setPositions(await posRes.json())
      if (compRes.ok) {
        const c = await compRes.json() as Record<string, unknown>
        if (typeof c.director === "string" && c.director) setDirectorName(c.director)
        const name = (c.brandName ?? c.name) as string | undefined
        if (name) setCompanyName(name)
      }
    } catch {
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreateModal = (parentId: string | null) => {
    setCreateParentId(parentId)
    setCreateName("")
    setCreateDesc("")
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!createName.trim()) { toast.error("Введите название отдела"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/modules/hr/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          parentId: createParentId || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        toast.error(d.error ?? "Ошибка создания")
        return
      }
      toast.success("Отдел создан")
      setCreateOpen(false)
      await fetchData()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setCreating(false)
    }
  }

  const { roots, unassigned } = buildTree(departments, positions)

  const parentDeptName = createParentId
    ? departments.find(d => d.id === createParentId)?.name ?? null
    : null

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Network className="h-6 w-6 text-primary" />
                Оргструктура
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Визуальное представление структуры компании
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
              </div>
            ) : departments.length === 0 && positions.length === 0 ? (
              <Card className="py-12">
                <CardContent className="flex flex-col items-center text-center text-muted-foreground gap-3">
                  <p>Нет данных. Создайте первый отдел.</p>
                  <Button size="sm" className="gap-1.5" onClick={() => openCreateModal(null)}>
                    <Plus className="w-3.5 h-3.5" />Создать отдел
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* ═══ Desktop: visual org chart ═══ */}
                <div className="hidden md:block overflow-x-auto pb-8">
                  <style>{TREE_CSS}</style>
                  <div className="org-tree min-w-fit">
                    {/* Root node — company/director */}
                    <div className="flex justify-center">
                      <div className="w-[230px] rounded-xl border-2 border-primary/30 bg-card shadow-md p-4 text-center group relative transition-all hover:shadow-lg hover:border-primary/50">
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          onClick={() => openCreateModal(null)}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Crown className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold">{companyName}</span>
                        </div>
                        {directorName && (
                          <p className="text-xs text-muted-foreground">Директор: {directorName}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {departments.length} отдел. · {positions.length} должн.
                        </p>
                      </div>
                    </div>

                    {/* Connector stem from root to first children */}
                    {roots.length > 0 && <div className="org-root-stem" />}

                    {/* Tree */}
                    {roots.length > 0 && (
                      <ul style={{ paddingTop: 0 }}>
                        {roots.map((node) => (
                          <OrgNodeDesktop key={node.dept.id} node={node} onAdd={openCreateModal} />
                        ))}
                      </ul>
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
                              {pos.grade && <Badge variant="outline" className="text-[9px] px-1 py-0">{pos.grade}</Badge>}
                              {salaryRange(pos) && <span className="text-muted-foreground">{salaryRange(pos)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ Mobile: vertical list ═══ */}
                <div className="md:hidden space-y-2">
                  <div className="rounded-lg border-2 border-primary/30 bg-card p-3 mb-3 group relative">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-primary" />
                      <span className="text-sm font-bold">{companyName}</span>
                      <button
                        type="button"
                        className="ml-auto w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => openCreateModal(null)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {directorName && (
                      <p className="text-xs text-muted-foreground ml-6">Директор: {directorName}</p>
                    )}
                  </div>

                  {roots.map((node) => (
                    <OrgNodeMobile key={node.dept.id} node={node} depth={0} onAdd={openCreateModal} />
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
                            {pos.grade && <Badge variant="outline" className="text-[9px] px-1 py-0">{pos.grade}</Badge>}
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

      {/* ─── Create department modal ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {parentDeptName ? `Новый подотдел в «${parentDeptName}»` : "Новый отдел"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Название *</Label>
              <Input
                id="dept-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Отдел продаж"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-desc">Описание</Label>
              <Textarea
                id="dept-desc"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Чем занимается отдел..."
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || !createName.trim()}>
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
