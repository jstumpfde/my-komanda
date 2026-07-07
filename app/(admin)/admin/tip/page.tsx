// /admin/tip — внутренний раздел «Типология» (владелец платформы).
// Гейт — тот же паттерн, что /admin/platform: email из PLATFORM_ADMIN_EMAILS,
// при несовпадении 404 (скрываем существование раздела).

import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { TipAdminClient } from "./tip-admin-client"

export const dynamic = "force-dynamic"

export default async function TipAdminPage() {
  const session = await auth()
  if (!isPlatformAdminEmail(session?.user?.email)) {
    notFound()
  }

  return (
    <AdminPageLayout>
      <TipAdminClient />
    </AdminPageLayout>
  )
}
