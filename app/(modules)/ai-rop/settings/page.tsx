// Настройки AI-РОП — хаб карточками (Card-секции по DESIGN-REFERENCE): Bitrix,
// автоимпорт, исторический импорт, менеджеры, скрипты/чек-листы, модель AI,
// глоссарий, бюджет, токены (read-only), расхождения с CRM, публичная ссылка,
// безопасная запись (dry-run). Гейт — requireRopManageViewer (директор/владелец).
import { eq, desc } from "drizzle-orm"
import { Settings } from "lucide-react"
import { db } from "@/lib/db"
import { ropManagers, ropSalesScripts } from "@/lib/db/schema"
import { getRopSettings, getSettingsJson } from "@/lib/ai-rop/settings"
import { getCompanyBudget, getMonthlyUsage } from "@/lib/ai-rop/budget"
import { getBillingStatus, getLedger } from "@/lib/ai-rop/tokens"
import { getActiveShareToken } from "@/lib/ai-rop/dashboard-share"
import { getViewStats } from "@/lib/ai-rop/report-views"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { requireRopManageViewer } from "../_components/rop-guard"
import { BitrixConnectionCard } from "./_components/bitrix-connection-card"
import { SafetyFlagsCard } from "./_components/safety-flags-card"
import { ModelCard } from "./_components/model-card"
import { GlossaryCard } from "./_components/glossary-card"
import { DiscrepancyCard, type DiscrepancyInitial } from "./_components/discrepancy-card"
import { BudgetCard } from "./_components/budget-card"
import { AutoImportCard } from "./_components/auto-import-card"
import { ImportForm } from "./_components/import-form"
import { ManagersCard, type ManagerRow } from "./_components/managers-card"
import { ScriptsCard, type ScriptRow } from "./_components/scripts-card"
import { ShareCard } from "./_components/share-card"
import { TokensSection } from "./_components/tokens-section"

export const dynamic = "force-dynamic"

export default async function AiRopSettingsPage() {
  const viewer = await requireRopManageViewer()

  const [settingsRow, budget, usage, billingStatus, ledger, shareToken, managersRows, scriptsRows] = await Promise.all([
    getRopSettings(viewer.companyId),
    getCompanyBudget(viewer.companyId),
    getMonthlyUsage(viewer.companyId),
    getBillingStatus(viewer.companyId),
    getLedger(viewer.companyId, { limit: 20 }),
    getActiveShareToken(viewer.companyId),
    db.select().from(ropManagers).where(eq(ropManagers.tenantId, viewer.companyId)).orderBy(ropManagers.name),
    db.select().from(ropSalesScripts).where(eq(ropSalesScripts.tenantId, viewer.companyId)).orderBy(desc(ropSalesScripts.updatedAt)),
  ])
  const viewStats = shareToken ? await getViewStats(viewer.companyId) : null

  const settingsJson = getSettingsJson(settingsRow)

  let customFields: string[] | null = null
  if (settingsRow.discrepancyCustomFields) {
    try {
      const parsed = JSON.parse(settingsRow.discrepancyCustomFields) as unknown
      if (Array.isArray(parsed)) customFields = parsed.map((v) => String(v))
    } catch { /* ignore malformed */ }
  }
  const discrepancyInitial: DiscrepancyInitial = {
    enabled: !!settingsRow.discrepancyEnabled,
    recipientMode: settingsRow.discrepancyRecipientMode === "admins" ? "admins" : "manager",
    actionMode: settingsRow.discrepancyActionMode === "auto_approve" ? "auto_approve" : "manual",
    severityMin: (settingsRow.discrepancySeverityMin === "low" || settingsRow.discrepancySeverityMin === "high" ? settingsRow.discrepancySeverityMin : "medium") as DiscrepancyInitial["severityMin"],
    customFields,
  }

  const managers: ManagerRow[] = managersRows.map((m) => ({
    bitrixManagerId: m.bitrixManagerId,
    name: m.name,
    isActive: m.isActive,
    excludedFromReports: m.excludedFromReports,
    defaultProduct: m.defaultProduct,
    crmSyncEnabled: m.crmSyncEnabled,
  }))
  const scripts: ScriptRow[] = scriptsRows.map((s) => ({
    id: s.id,
    name: s.name,
    product: s.product,
    direction: (s.direction as ScriptRow["direction"]) || "all",
    isActive: s.isActive,
    contentMd: s.contentMd,
    checklistJson: Array.isArray(s.checklistJson) ? (s.checklistJson as ScriptRow["checklistJson"]) : [],
    updatedAt: (s.updatedAt as unknown as Date)?.toISOString?.() ?? "",
  }))

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://company24.pro"

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-5 flex items-center gap-2 pt-3 pb-2">
              <Settings className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Настройки AI-РОП</h1>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BitrixConnectionCard initialWebhookUrl={settingsRow.bitrixWebhookUrl ?? ""} initialInboundToken={settingsRow.bitrixInboundToken ?? ""} />
              <SafetyFlagsCard initialDryRunCrm={settingsRow.dryRunCrm} initialDryRunMessages={settingsRow.dryRunMessages} />

              <AutoImportCard initialEnabled={settingsJson.autoImportEnabled === true} lastAt={settingsJson.lastImportAt ?? null} />
              <ImportForm />

              <ModelCard initial={settingsRow.analysisModel} />
              <GlossaryCard initial={settingsRow.glossary ?? ""} />

              <DiscrepancyCard initial={discrepancyInitial} />
              <BudgetCard initial={budget} usage={usage} />

              <TokensSection status={billingStatus} ledger={ledger} />
              <ShareCard initialToken={shareToken} baseUrl={baseUrl} stats={viewStats} />

              <div className="lg:col-span-2"><ManagersCard managers={managers} /></div>
              <div className="lg:col-span-2"><ScriptsCard scripts={scripts} /></div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
