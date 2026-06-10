// /admin/platform/deadlines — подстраница платформенной панели.
// Загружает все данные через общий loadPlatformAdminData() и
// открывает нужный таб через defaultTab="deadlines".

import { loadPlatformAdminData } from "@/lib/platform/admin-data"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { PlatformAdminClient } from "../platform-admin-client"

export const dynamic = "force-dynamic"

export default async function PlatformAdminPage() {
  const data = await loadPlatformAdminData()
  return (
    <AdminPageLayout>
      <PlatformAdminClient
        {...data}
        defaultTab="deadlines"
      />
    </AdminPageLayout>
  )
}
