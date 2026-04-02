"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { FileText } from "lucide-react"

export default function TemplatesPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6 max-w-4xl" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-foreground mb-1">Шаблоны сообщений</h1>
              <p className="text-sm text-muted-foreground">Шаблоны писем и сообщений для кандидатов</p>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">В разработке</p>
                <p className="text-sm text-muted-foreground/60 mt-1 max-w-sm">
                  Здесь можно будет создавать шаблоны писем: приглашение на интервью, оффер, отказ, приветствие и другие. С поддержкой переменных (имя, вакансия, дата).
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
