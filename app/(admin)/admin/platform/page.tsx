// Корень /admin/platform — редиректим на первый значимый раздел.
// Данные + UI живут в подстраницах /admin/platform/{section}.
// Старые deep-link'и ?tab=<section> (до разбиения на подстраницы 10.06.2026)
// маппим на соответствующую подстраницу, чтобы закладки/доки не ломались.

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const SECTIONS = new Set([
  "branding", "companies", "consent-log", "cron", "deadlines", "emergency", "logs",
  "migrations", "presence", "templates", "vacancies", "yulia",
])

export default async function PlatformAdminRootPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  if (tab && SECTIONS.has(tab)) redirect(`/admin/platform/${tab}`)
  redirect("/admin/platform/companies")
}
