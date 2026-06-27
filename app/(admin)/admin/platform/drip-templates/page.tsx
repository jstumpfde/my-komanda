// /admin/platform/drip-templates — платформенные шаблоны дожима (drip).
// Эталон, из которого конструктор воронки генерит цепочки касаний стадии.
// Доступ — платформ-админ.

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { actionGetDripTemplates } from "../actions"
import { DripTemplatesClient } from "./drip-templates-client"

export const dynamic = "force-dynamic"

export default async function DripTemplatesPage() {
  const { current, seed } = await actionGetDripTemplates()
  return (
    <AdminPageLayout>
      <DripTemplatesClient initial={current} seed={seed} />
    </AdminPageLayout>
  )
}
