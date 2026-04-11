"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { MaterialEditor } from "@/components/core/material-editor"

function backUrlFor(from: string | null): string {
  switch (from) {
    case "knowledge":
      return "/knowledge-v2"
    case "learning":
      return "/learning/courses"
    case "hr":
      return "/hr/library"
    case "crm":
      return "/"
    case "adaptation":
      return "/hr/adaptation"
    default:
      return "/"
  }
}

function WorkshopContent() {
  const searchParams = useSearchParams()
  const from = searchParams.get("from")
  return (
    <MaterialEditor
      backUrl={backUrlFor(from)}
      showAiTools={true}
    />
  )
}

export default function WorkshopPage() {
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
          <WorkshopContent />
        </SidebarInset>
      </SidebarProvider>
    </Suspense>
  )
}
