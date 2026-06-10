import { redirect } from "next/navigation"

/**
 * /hr/calendar → /hr/interviews?tab=calendar
 *
 * Пробрасываем исходные query-параметры view и filter в CalendarView.
 * Next.js 16: searchParams — Promise, await обязателен.
 */
export default async function CalendarRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; filter?: string }>
}) {
  const sp = await searchParams
  const params = new URLSearchParams({ tab: "calendar" })
  if (sp.view) params.set("view", sp.view)
  if (sp.filter) params.set("filter", sp.filter)
  redirect(`/hr/interviews?${params.toString()}`)
}
