// /admin/platform/demo — подстраница платформенной панели.
// Загружает все данные через общий loadPlatformAdminData() и
// открывает таб «Демо» через defaultTab="demo".

import { loadPlatformAdminData } from "@/lib/platform/admin-data"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { PlatformAdminClient } from "../platform-admin-client"

export const dynamic = "force-dynamic"

export default async function PlatformDemoPage() {
  const data = await loadPlatformAdminData()
  return (
    <AdminPageLayout>
      <PlatformAdminClient
        {...data}
        defaultTab="demo"
      />
    </AdminPageLayout>
  )
}
