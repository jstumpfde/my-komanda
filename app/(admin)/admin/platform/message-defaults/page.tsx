// /admin/platform/message-defaults — платформенные дефолтные тексты сообщений.
// Эталон для всех компаний (наследование платформа→компания→вакансия).
// Доступ — только платформ-админ (gate в AdminPageLayout + server-actions).

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { actionGetMessageDefaults } from "../actions"
import { MessageDefaultsClient } from "./message-defaults-client"

export const dynamic = "force-dynamic"

export default async function MessageDefaultsPage() {
  const { current, seed } = await actionGetMessageDefaults()
  return (
    <AdminPageLayout>
      <MessageDefaultsClient initial={current} seed={seed} />
    </AdminPageLayout>
  )
}
