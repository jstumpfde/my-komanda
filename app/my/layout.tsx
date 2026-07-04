// Личная страница Юрия (/my) — все его сервисы и роли в одном месте.
// Защита тем же паттерном, что /admin/platform (Group 14): email из
// PLATFORM_ADMIN_EMAILS, иначе 404 (скрываем существование раздела).
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

export default async function MyPageLayout({
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
