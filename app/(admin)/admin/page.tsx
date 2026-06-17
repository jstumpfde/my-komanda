// /admin — индекс админ-панели: редиректит на дашборд (своей страницы нет).
import { redirect } from "next/navigation"

export default function AdminIndexPage() {
  redirect("/admin/dashboard")
}
