// Group 14 — защита /admin/platform.
// Доступ только для email из PLATFORM_ADMIN_EMAILS. Возвращаем 404
// (а не Forbidden) чтобы скрыть существование раздела от обычных
// пользователей и от сканеров.

import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!isPlatformAdminEmail(session?.user?.email)) {
    notFound()
  }
  return <>{children}</>
}
