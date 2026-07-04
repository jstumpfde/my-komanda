// Telegram-постинг — доступ только владельцу платформы (email из
// PLATFORM_ADMIN_EMAILS), как и раздел /admin/platform. 404 (не 403), чтобы
// скрыть существование раздела от обычных пользователей.

import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export default async function TelegramPostingMarketingLayout({
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
