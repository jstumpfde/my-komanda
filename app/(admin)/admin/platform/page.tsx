// Корень /admin/platform — редиректим на первый значимый раздел.
// Данные + UI живут в подстраницах /admin/platform/{section}.

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function PlatformAdminRootPage() {
  redirect("/admin/platform/companies")
}
