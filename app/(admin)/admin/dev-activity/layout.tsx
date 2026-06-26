import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { canSeeDevActivity } from "@/lib/dev-activity/access"

// Приватный раздел владельца: посторонним — 404 (прячем сам факт раздела).
export default async function DevActivityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!canSeeDevActivity(session?.user?.email, session?.user?.role as string)) {
    notFound()
  }
  return <>{children}</>
}
