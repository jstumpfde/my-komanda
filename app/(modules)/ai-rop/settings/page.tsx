// Настройки AI-РОП — хаб карточками (Card-секции по DESIGN-REFERENCE): Bitrix,
// автоимпорт, исторический импорт, импорт email/чатов, менеджеры (+ привязка к
// пользователю платформы), скрипты/чек-листы, модель AI, распознавание речи
// (Yandex STT), глоссарий, таксономия возражений, параметры дашборда, бюджет,
// токены (read-only), расхождения с CRM, переанализ, публичная ссылка,
// безопасная запись (dry-run). Гейт — requireRopManageViewer (директор/владелец).
import { eq, desc, isNull, and } from "drizzle-orm"
import { Settings } from "lucide-react"
import { db } from "@/lib/db"
import { ropManagers, ropSalesScripts, users } from "@/lib/db/schema"
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
import { BitrixActivitiesCard } from "./_components/bitrix-activities-card"
import { ManagersCard, type ManagerRow, type PlatformUserOption } from "./_components/managers-card"
import { ScriptsCard, type ScriptRow } from "./_components/scripts-card"
import { ShareCard } from "./_components/share-card"
import { TokensSection } from "./_components/tokens-section"
import { SttCard, type SttInitial } from "./_components/stt-card"
import { DashboardSettingsCard, type DashboardSettingsInitial } from "./_components/dashboard-settings-card"
import { ObjectionTaxonomyCard } from "./_components/objection-taxonomy-card"
import { ReanalyzeCard } from "./_components/reanalyze-card"

export const dynamic = "force-dynamic"

const DEFAULT_CONTACT_THRESHOLD_SECONDS = 15
const DEFAULT_RECORDINGS_RETENTION_DAYS = 30
const DEFAULT_WEEKLY_DONE_GOAL = 50

export default async function AiRopSettingsPage() {
  const viewer = await requireRopManageViewer()

  const [settingsRow, budget, usage, billingStatus, ledger, shareToken, managersRows, scriptsRows, platformUsersRows] = await Promise.all([
    getRopSettings(viewer.companyId),
    getCompanyBudget(viewer.companyId),
    getMonthlyUsage(viewer.companyId),
    getBillingStatus(viewer.companyId),
    getLedger(viewer.companyId, { limit: 20 }),
    getActiveShareToken(viewer.companyId),
    db.select().from(ropManagers).where(eq(ropManagers.tenantId, viewer.companyId)).orderBy(ropManagers.name),
    db.select().from(ropSalesScripts).where(eq(ropSalesScripts.tenantId, viewer.companyId)).orderBy(desc(ropSalesScripts.updatedAt)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.companyId, viewer.companyId), isNull(users.deletedAt)))
      .orderBy(users.name),
  ])
  const viewStats = shareToken ? await getViewStats(viewer.companyId) : null

  const settingsJson = getSettingsJson(settingsRow)
  const sttJson = settingsJson.stt ?? {}
  // Write-only секрет: НИКОГДА не передаём полный ключ в клиентский компонент —
  // только факт настройки + короткий хвост (отличие от bitrixWebhookUrl ниже,
  // который исторически передаётся как есть, см. bitrix-connection-card.tsx).
  const sttInitial: SttInitial = {
    configured: !!sttJson.yandexApiKey?.trim(),
    keyTail: sttJson.yandexApiKey?.trim() ? sttJson.yandexApiKey.trim().slice(-4) : null,
    folderId: sttJson.yandexFolderId ?? "",
    allowForeignFallback: sttJson.allowForeignSttFallback === true,
  }
  const dashboardSettingsInitial: DashboardSettingsInitial = {
    contactThresholdSeconds: typeof settingsJson.contactThresholdSeconds === "number" ? settingsJson.contactThresholdSeconds : DEFAULT_CONTACT_THRESHOLD_SECONDS,
    recordingsRetentionDays: typeof settingsJson.recordingsRetentionDays === "number" ? settingsJson.recordingsRetentionDays : DEFAULT_RECORDINGS_RETENTION_DAYS,
    weeklyDoneGoal: typeof settingsJson.weeklyDoneGoal === "number" ? settingsJson.weeklyDoneGoal : DEFAULT_WEEKLY_DONE_GOAL,
  }
  const platformUsers: PlatformUserOption[] = platformUsersRows.map((u) => ({ id: u.id, name: u.name, email: u.email }))

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
    userId: m.userId,
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

              <BitrixActivitiesCard initialLastFetched={settingsJson.activitiesLastFetchedAt ?? null} />
              <SttCard initial={sttInitial} />

              <ModelCard initial={settingsRow.analysisModel} />
              <GlossaryCard initial={settingsRow.glossary ?? ""} />

              <ObjectionTaxonomyCard initial={settingsJson.objectionTaxonomy ?? null} />
              <DashboardSettingsCard initial={dashboardSettingsInitial} />

              <DiscrepancyCard initial={discrepancyInitial} />
              <BudgetCard initial={budget} usage={usage} />

              <TokensSection status={billingStatus} ledger={ledger} />
              <ShareCard initialToken={shareToken} baseUrl={baseUrl} stats={viewStats} />

              <div className="lg:col-span-2"><ManagersCard managers={managers} platformUsers={platformUsers} /></div>
              <div className="lg:col-span-2"><ScriptsCard scripts={scripts} /></div>
              <div className="lg:col-span-2"><ReanalyzeCard /></div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
