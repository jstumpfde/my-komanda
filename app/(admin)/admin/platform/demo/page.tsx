// /admin/platform/demo — подстраница платформенной панели (таб «Демо»).
// Раньше пункт меню «Демо-данные» вёл сюда, но страницы не было → 404.
// Грузит общие данные и открывает таб demo (как другие /admin/platform/*).

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
