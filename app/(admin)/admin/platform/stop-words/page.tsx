// /admin/platform/stop-words — платформенный baseline стоп-слов (F6).
// Эталон для всех компаний; раньше был захардкожен в коде. Доступ — платформ-админ.
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { actionGetStopWordsBaseline } from "../actions"
import { StopWordsClient } from "./stop-words-client"

export const dynamic = "force-dynamic"

export default async function StopWordsPage() {
  const { current, seed } = await actionGetStopWordsBaseline()
  return (
    <AdminPageLayout>
      <StopWordsClient initial={current} seed={seed} />
    </AdminPageLayout>
  )
}
