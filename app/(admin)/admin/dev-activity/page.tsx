import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { getSeries } from "@/lib/dev-activity/store"
import { DISPLAY_LABEL } from "@/lib/dev-activity/config"
import { DevActivityClient } from "./dev-activity-client"

export const dynamic = "force-dynamic"

export default async function DevActivityPage() {
  const data = await getSeries()
  return (
    <AdminPageLayout>
      <DevActivityClient initial={data} personLabel={DISPLAY_LABEL} />
    </AdminPageLayout>
  )
}
