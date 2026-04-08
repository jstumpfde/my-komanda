"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Eye, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS, getDefaultSections } from "@/lib/demo-types"
import type { DemoTemplate } from "@/lib/demo-types"

const SYSTEM_TEMPLATES: DemoTemplate[] = [
  {
    id: "sys-1",
    name: "Менеджер по продажам B2B",
    niche: "sales_b2b",
    length: "standard",
    isSystem: true,
    sections: getDefaultSections("standard"),
  },
]

const MY_TEMPLATES: DemoTemplate[] = []

function countSubblocks(template: DemoTemplate): number {
  return template.sections.reduce((sum, s) => sum + s.subblocks.filter((sb) => sb.enabled).length, 0)
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState("system")

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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="system">Системные</TabsTrigger>
              <TabsTrigger value="my">Мои шаблоны</TabsTrigger>
            </TabsList>

            {/* === TAB: Системные === */}
            <TabsContent value="system">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SYSTEM_TEMPLATES.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </TabsContent>

            {/* === TAB: Мои шаблоны === */}
            <TabsContent value="my">
              {MY_TEMPLATES.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">
                    У вас пока нет своих шаблонов
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
                  {MY_TEMPLATES.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function TemplateCard({ template }: { template: DemoTemplate }) {
  const nicheInfo = NICHE_LABELS[template.niche]
  const lengthInfo = LENGTH_LABELS[template.length]
  const subblockCount = countSubblocks(template)

  return (
    <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {/* Title */}
        <p className="text-sm font-semibold mb-3">{template.name}</p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {template.isSystem && (
            <Badge variant="secondary" className="text-xs">
              Системный
            </Badge>
          )}
          <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">
            {nicheInfo.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {lengthInfo.label}
          </Badge>
        </div>

        {/* Subblock count */}
        <p className="text-xs text-muted-foreground mb-4">
          {subblockCount} подблоков
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button size="sm">Использовать</Button>
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4 mr-1" />
            Предпросмотр
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
