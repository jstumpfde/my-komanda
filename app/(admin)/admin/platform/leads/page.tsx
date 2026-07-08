// /admin/platform/leads — заявки с /landing и /portfolio (landing_leads).
// Доступ ограничен layout'ом /admin/platform (email из PLATFORM_ADMIN_EMAILS).

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { LeadsClient } from "./leads-client"

export const dynamic = "force-dynamic"

export default function LeadsPage() {
  return (
    <AdminPageLayout>
      <LeadsClient />
    </AdminPageLayout>
  )
}
