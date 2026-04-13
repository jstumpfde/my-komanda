"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Building2, Briefcase, ChevronRight, ChevronDown, Network, Users } from "lucide-react"

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

  // Assign positions
  const unassigned: Position[] = []
  positions.forEach((p) => {
    if (p.departmentId && nodeMap.has(p.departmentId)) {
      nodeMap.get(p.departmentId)!.positions.push(p)
    } else {
      unassigned.push(p)
    }
  })

  // Build parent-child
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

// ─── Department node component ───────────────────────────
function DeptNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0 || node.positions.length > 0

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <Card className="mb-2">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-muted rounded transition-colors"
              disabled={!hasChildren}
            >
              {hasChildren ? (
                expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="w-4" />
              )}
            </button>
            <Building2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">{node.dept.name}</CardTitle>
            {node.dept.headUserName && (
              <Badge variant="secondary" className="ml-auto gap-1 text-xs">
                <Users className="h-3 w-3" />
                {node.dept.headUserName}
              </Badge>
            )}
          </div>
          {node.dept.description && (
            <p className="text-xs text-muted-foreground ml-[52px]">{node.dept.description}</p>
          )}
        </CardHeader>
        {expanded && (node.positions.length > 0 || node.children.length > 0) && (
          <CardContent className="pt-0 pb-3 px-4">
            {/* Positions */}
            {node.positions.length > 0 && (
              <div className="ml-[28px] space-y-1">
                {node.positions.map((pos) => (
                  <div key={pos.id} className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/30">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm">{pos.name}</span>
                    {pos.grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pos.grade}</Badge>}
                    {salaryRange(pos) && (
                      <span className="text-xs text-muted-foreground ml-auto">{salaryRange(pos)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
      {/* Child departments */}
      {expanded && node.children.map((child) => (
        <DeptNode key={child.dept.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function OrgStructurePage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [deptRes, posRes] = await Promise.all([
        fetch("/api/modules/hr/departments"),
        fetch("/api/modules/hr/org/positions"),
      ])
      if (!deptRes.ok || !posRes.ok) throw new Error()
      setDepartments(await deptRes.json())
      setPositions(await posRes.json())
    } catch {
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const { roots, unassigned } = buildTree(departments, positions)

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
              <p className="text-center py-12 text-muted-foreground">Загрузка...</p>
            ) : departments.length === 0 && positions.length === 0 ? (
              <Card className="py-12">
                <CardContent className="text-center text-muted-foreground">
                  Нет данных. Создайте отделы и должности.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {/* Department tree */}
                {roots.map((node) => (
                  <DeptNode key={node.dept.id} node={node} depth={0} />
                ))}

                {/* Unassigned positions */}
                {unassigned.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Без отдела
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3 px-4">
                      <div className="ml-[28px] space-y-1">
                        {unassigned.map((pos) => (
                          <div key={pos.id} className="flex items-center gap-2 py-1.5 px-3 rounded-md bg-muted/30">
                            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm">{pos.name}</span>
                            {pos.grade && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pos.grade}</Badge>}
                            {salaryRange(pos) && (
                              <span className="text-xs text-muted-foreground ml-auto">{salaryRange(pos)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
