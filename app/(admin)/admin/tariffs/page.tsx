// Дубль /admin/plans — перенаправляем на актуальную страницу тарифов.
// Старый UI работал на DEFAULT_TARIFFS (захардкоженные данные, не из БД).
// Актуальный раздел /admin/plans читает реальные данные из таблицы plans + plan_modules.

import { redirect } from "next/navigation"

export default function AdminTariffsRedirectPage() {
  redirect("/admin/plans")
}
