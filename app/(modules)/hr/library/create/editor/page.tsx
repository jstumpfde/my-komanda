"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Save, Eye, BookOpen, ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { UniversalBlockEditor } from "@/components/editor/universal-block-editor"
import { LENGTH_LABELS, NICHE_LABELS, getDefaultSections, DEMO_VARIABLES } from "@/lib/demo-types"
import type { DemoLength, DemoNiche } from "@/lib/demo-types"
import type { Section, Variable } from "@/components/editor/types"
import Link from "next/link"

function demoSectionsToEditorSections(demoSections: ReturnType<typeof getDefaultSections>): Section[] {
  return demoSections.map((s) => ({
    id: s.id,
    key: s.key,
    title: `${s.emoji} ${s.title}`,
    emoji: s.emoji,
    blocks: s.subblocks.map((sb, i) => ({
      id: sb.id,
      type: sb.type === "text_media" ? "text" as const : sb.type === "video_card" ? "video_record" as const : sb.type as "text",
      content: { html: sb.content || "" },
      enabled: sb.enabled,
      order: i,
    })),
  }))
}

export default function EditorPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Загрузка...</div>}><EditorContent /></Suspense>
}

function EditorContent() {
  const searchParams = useSearchParams()
  const length = (searchParams.get("length") ?? "standard") as DemoLength
  const niche = (searchParams.get("niche") ?? "universal") as DemoNiche
  const template = searchParams.get("template") ?? "empty"
  const initialName = searchParams.get("name") ?? ""

  const [demoName, setDemoName] = useState(initialName || `Демонстрация: ${NICHE_LABELS[niche]?.label ?? ""}`)
  const [sections, setSections] = useState<Section[]>(() => demoSectionsToEditorSections(getDefaultSections(length)))

  const variables: Variable[] = DEMO_VARIABLES.map((v) => ({ ...v, value: "" }))

  const totalBlocks = sections.reduce((sum, s) => sum + s.blocks.filter((b) => b.enabled).length, 0)
  const filledBlocks = sections.reduce((sum, s) => sum + s.blocks.filter((b) => b.enabled && (b.content as { html?: string }).html).length, 0)
  const progressPct = totalBlocks > 0 ? Math.round((filledBlocks / totalBlocks) * 100) : 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Top bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <Link href="/hr/library/create">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <Input
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  className="text-lg font-semibold border-none shadow-none px-0 h-auto bg-transparent focus-visible:ring-0"
                  placeholder="Название демонстрации"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs">{LENGTH_LABELS[length]?.label}</Badge>
                <Badge variant="outline" className="text-xs">{NICHE_LABELS[niche]?.label}</Badge>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Eye className="w-3.5 h-3.5" />Предпросмотр
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Сохранено")}>
                  <Save className="w-3.5 h-3.5" />Сохранить
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Шаблон сохранён")}>
                  <BookOpen className="w-3.5 h-3.5" />Как шаблон
                </Button>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-3 mb-4">
              <Progress value={progressPct} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Заполнено на {progressPct}%</span>
            </div>

            {/* Editor */}
            <UniversalBlockEditor
              blocks={[]}
              onBlocksChange={() => {}}
              sectionMode
              sections={sections}
              onSectionsChange={setSections}
              variables={variables}
            />

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
