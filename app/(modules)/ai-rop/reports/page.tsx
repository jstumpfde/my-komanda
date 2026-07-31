/**
 * /ai-rop/reports — отчёты в Bitrix: разовая отправка (превью + отправить)
 * и расписания автоотправки. Командная страница — гейт ropCanViewTeam,
 * редирект на /ai-rop.
 *
 * Данные для клиентского компонента (см. ./_client.tsx):
 *  - список расписаний (rop_report_schedules)
 *  - настройки компании (rop_settings) → Bitrix-конфиг + dryRunMessages
 *  - менеджеры компании (для «по менеджеру»)
 *  - список чатов бота Bitrix (best-effort, [] если портал недоступен)
 */
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { AlertCircle, Send } from "lucide-react"
import { auth } from "@/auth"
import { ropCanViewTeam } from "@/lib/ai-rop/access"
import { db } from "@/lib/db"
import { ropManagers } from "@/lib/db/schema"
import { listSchedules } from "@/lib/ai-rop/reports-scheduler"
import { getRopSettings, toBitrixConfig } from "@/lib/ai-rop/settings"
import { createBitrixClient } from "@/lib/ai-rop/bitrix"
import { listBotChats, type BotChat } from "@/lib/ai-rop/bitrix-im"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { ReportsClient } from "./_client"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const session = await auth()
  const user = session?.user
  if (!user?.companyId) redirect("/login")
  const companyId = user.companyId as string
  if (!ropCanViewTeam(user)) redirect("/ai-rop")

  const [schedules, settingsRow, managerRows] = await Promise.all([
    listSchedules(companyId),
    getRopSettings(companyId),
    db
      .select({ id: ropManagers.bitrixManagerId, name: ropManagers.name })
      .from(ropManagers)
      .where(eq(ropManagers.tenantId, companyId)),
  ])

  let botChats: BotChat[] = []
  const bitrixConfig = toBitrixConfig(settingsRow)
  if (bitrixConfig) {
    try {
      const client = createBitrixClient(bitrixConfig)
      botChats = await listBotChats(client)
    } catch {
      botChats = []
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <TrialBanner />
            <div className="flex items-center gap-2 pt-3 pb-2">
              <Send className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Отчёты в Bitrix</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              Сформируйте отчёт за период и отправьте в Bitrix-мессенджер вручную, либо настройте
              автоматическую отправку по расписанию.
            </p>

            {!bitrixConfig && (
              <Card className="mb-4 border-amber-500/30 bg-amber-500/10">
                <CardContent className="py-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-4 shrink-0" />
                  Bitrix не подключён — настройте вебхук в Настройках модуля, чтобы отправлять отчёты.
                </CardContent>
              </Card>
            )}

            <ReportsClient
              managers={managerRows}
              schedules={schedules}
              botChats={botChats}
              dryRunMessages={settingsRow.dryRunMessages}
            />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
