"use client"

import { Suspense } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { MaterialEditor } from "@/components/core/material-editor"

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-muted-foreground">
          Загрузка...
        </div>
      }
    >
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <MaterialEditor
            backUrl="/hr/library"
            showAiTools={true}
          />
        </SidebarInset>
      </SidebarProvider>
    </Suspense>
  )
}
