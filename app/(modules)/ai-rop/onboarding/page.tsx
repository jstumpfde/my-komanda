// /ai-rop/onboarding — мастер подключения SalesRadar (trial-витрина).
// Идея Юрия: клиент подключается на 3-7 дней, видит на своих данных, что
// упускает — это и есть продажа. Три шага: подключить канал → читаем
// историю → «вот что мы нашли» (переброс на /ai-rop/attention, /ai-rop/deals).
//
// Шаг 1 переиспользует ConnectorsClient как есть (та же логика/API, что и
// экран «Каналы») — здесь мы её просто оборачиваем в шаги мастера, никакого
// форка кода подключения.
//
// Гейт — requireRopManageViewer (то же, что у /ai-rop/connectors и /ai-rop/settings):
// подключение каналов — решение директора/владельца компании.
import { desc, eq } from "drizzle-orm"
import { Rocket } from "lucide-react"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { requireRopManageViewer } from "../_components/rop-guard"
import type { ConnectorRow } from "../connectors/_components/connectors-client"
import { OnboardingWizard } from "./_components/onboarding-wizard"

export const dynamic = "force-dynamic"

function webhookUrlFor(connectorId: string, secret: string): string {
  const base = process.env.NEXTAUTH_URL || "https://company24.pro"
  return `${base.replace(/\/$/, "")}/api/salesradar/webhook/${connectorId}?secret=${secret}`
}

export default async function SalesRadarOnboardingPage() {
  const viewer = await requireRopManageViewer()

  const rows = await db
    .select()
    .from(ropChannelConnectors)
    .where(eq(ropChannelConnectors.companyId, viewer.companyId))
    .orderBy(desc(ropChannelConnectors.createdAt))

  const connectors: ConnectorRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    providerKey: r.providerKey,
    title: r.title ?? r.kind,
    mode: r.mode,
    country: r.country ?? "RU",
    isEnabled: r.isEnabled,
    status: r.status,
    lastSyncAt: r.lastSyncAt ? r.lastSyncAt.toISOString() : null,
    lastError: r.lastError,
    webhookUrl: r.mode === "webhook" && r.webhookSecret ? webhookUrlFor(r.id, r.webhookSecret) : null,
  }))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-1 flex items-center gap-2 pt-3 pb-2">
              <Rocket className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Мастер подключения SalesRadar</h1>
            </div>
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
              Три шага, без сложных настроек: подключаем канал, читаем историю переписки — и показываем,
              что команда упускает прямо сейчас. Это пробный период, ничего не сломает вашу работу.
            </p>

            <OnboardingWizard initialConnectors={connectors} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
