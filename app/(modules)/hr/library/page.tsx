"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Eye, BookOpen, Pencil, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS } from "@/lib/demo-types"
import { toast } from "sonner"

interface TemplateRow {
  id: string
  name: string
  niche: string
  length: string
  isSystem: boolean
  sections: unknown[]
  createdAt: string
  updatedAt: string
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState("my")
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTemplates = () => {
    setLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setTemplates(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }

  useEffect(() => { fetchTemplates() }, [])

  const systemTemplates = templates.filter((t) => t.isSystem)
  const myTemplates = templates.filter((t) => !t.isSystem)

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/demo-templates/${deleteId}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Шаблон удалён")
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId))
      } else {
        toast.error("Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setDeleting(false)
    setDeleteId(null)
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Библиотека демонстраций</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Шаблоны для демонстраций должности кандидатам
              </p>
            </div>
            <Button asChild>
              <Link href="/hr/library/create">
                <Plus className="h-4 w-4 mr-1" />
                Создать демонстрацию
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="my">Мои шаблоны ({myTemplates.length})</TabsTrigger>
                <TabsTrigger value="system">Системные ({systemTemplates.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="my">
                {myTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      Нет шаблонов. Создайте первый!
                    </p>
                    <Button asChild className="mt-2">
                      <Link href="/hr/library/create">
                        <Plus className="h-4 w-4 mr-1" />
                        Создать первый шаблон
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myTemplates.map((template) => (
                      <TemplateCard key={template.id} template={template} onDelete={() => setDeleteId(template.id)} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="system">
                {systemTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Системные шаблоны пока недоступны</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {systemTemplates.map((template) => (
                      <TemplateCard key={template.id} template={template} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SidebarInset>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить шаблон?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Шаблон будет удалён без возможности восстановления.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}

function TemplateCard({ template, onDelete }: { template: TemplateRow; onDelete?: () => void }) {
  const nicheInfo = NICHE_LABELS[template.niche]
  const lengthInfo = LENGTH_LABELS[template.length]
  const lessonsCount = Array.isArray(template.sections) ? template.sections.length : 0
  const updatedAt = template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("ru-RU") : ""

  return (
    <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <p className="text-sm font-semibold mb-2">{template.name}</p>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {template.isSystem && <Badge variant="secondary" className="text-xs">Системный</Badge>}
          {nicheInfo && <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">{nicheInfo.label}</Badge>}
          {lengthInfo && <Badge variant="outline" className="text-xs">{lengthInfo.label}</Badge>}
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {lessonsCount} {lessonsCount === 1 ? "урок" : lessonsCount < 5 ? "урока" : "уроков"}
          {updatedAt && <span className="ml-2">{updatedAt}</span>}
        </p>

        <div className="flex items-center gap-2">
          <Button size="sm" asChild>
            <Link href={`/hr/library/create/editor?id=${template.id}`}>
              <Pencil className="h-3.5 w-3.5 mr-1" />Редактировать
            </Link>
          </Button>
          {!template.isSystem && onDelete && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
