// Старая заглушка «Шаблоны сообщений» («В разработке»). Реальные сообщения
// кандидатам (приветствие/отказ/приглашение/дожим) настраиваются в блоках воронки —
// /hr/hiring-settings → «Воронка и автоматизация». Редиректим туда.
import { redirect } from "next/navigation"

export default function TemplatesRedirectPage() {
  redirect("/hr/hiring-settings?tab=funnel")
}
