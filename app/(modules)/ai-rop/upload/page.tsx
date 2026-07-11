// Ручная загрузка взаимодействия (чат/email/встреча/звонок) — омниканальный
// сбор в обход Bitrix-вебхука. Доступ — team-viewer (не manager).
import { Upload } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { requireRopTeamViewer } from "../_components/rop-guard"
import { UploadForm } from "./UploadForm"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  await requireRopTeamViewer()

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <Upload className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Загрузить запись</h1>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Запись Zoom, Яндекс Телемост, переписка или голосовая запись — пройдёт через транскрипцию и тот же AI-анализ,
              что и звонки. Результат появится в списке звонков через минуту-другую.
            </p>
            <UploadForm />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
