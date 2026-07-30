// /admin/platform/ai-rop — платформ-админка биллинга/эксплуатации AI-РОП.
// Гейт — общий layout.tsx родителя /admin/platform (isPlatformAdminEmail, 404).
// Данные грузит клиентский компонент по табам (deadlines-паттерн) — каждый
// /api/platform/ai-rop/* роут дублирует проверку сессии на всякий случай.
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { AiRopAdminClient } from "./ai-rop-admin-client"

export const dynamic = "force-dynamic"

export default function AiRopAdminPage() {
  return (
    <AdminPageLayout>
      <AiRopAdminClient />
    </AdminPageLayout>
  )
}
