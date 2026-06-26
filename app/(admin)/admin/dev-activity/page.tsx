import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { getAllSeries } from "@/lib/dev-activity/store"
import { DevActivityClient } from "./dev-activity-client"

export const dynamic = "force-dynamic"

export default async function DevActivityPage() {
  const projects = await getAllSeries()
  return (
    <AdminPageLayout>
      <DevActivityClient projects={projects} />
    </AdminPageLayout>
  )
}
