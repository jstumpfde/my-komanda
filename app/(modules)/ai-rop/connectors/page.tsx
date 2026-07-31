// Экран «Каналы» SalesRadar — подключение источников коммуникации (почта,
// Telegram, WhatsApp) в обход CRM. Список подключённых + форма добавления +
// статус последней синхронизации + вебхук-URL для копирования (webhook-режим).
// Гейт — requireRopManageViewer (директор/владелец), как и остальные настройки
// AI-РОП: креды каналов не менее чувствительны, чем Bitrix-webhook.
import { desc, eq } from "drizzle-orm"
import { Radio } from "lucide-react"
import { db } from "@/lib/db"
import { ropChannelConnectors } from "@/lib/db/schema"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { requireRopManageViewer } from "../_components/rop-guard"
import { ConnectorsClient, type ConnectorRow } from "./_components/connectors-client"
import { TrialBanner } from "../_components/trial-banner"

export const dynamic = "force-dynamic"

function webhookUrlFor(connectorId: string, secret: string): string {
  const base = process.env.NEXTAUTH_URL || "https://company24.pro"
  return `${base.replace(/\/$/, "")}/api/salesradar/webhook/${connectorId}?secret=${secret}`
}

export default async function SalesRadarConnectorsPage() {
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
            <TrialBanner />
            <div className="mb-5 flex items-center gap-2 pt-3 pb-2">
              <Radio className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Каналы SalesRadar</h1>
            </div>
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
              Подключите почту, Telegram или WhatsApp — SalesRadar читает переписку напрямую,
              минуя CRM, и складывает её в единую ленту контрагента.
            </p>

            <ConnectorsClient initialConnectors={connectors} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
