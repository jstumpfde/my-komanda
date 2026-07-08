// /admin/platform/client-pages — витрина клиентских страниц.
// Доступ ограничен layout'ом /admin/platform (email из PLATFORM_ADMIN_EMAILS).
// Данные грузит сам клиент через /api/platform/client-pages (fs, без общего
// loadPlatformAdminData — раздел самодостаточный).

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { ClientPagesClient } from "./client-pages-client"

export const dynamic = "force-dynamic"

export default function ClientPagesPage() {
  return (
    <AdminPageLayout>
      <ClientPagesClient />
    </AdminPageLayout>
  )
}
