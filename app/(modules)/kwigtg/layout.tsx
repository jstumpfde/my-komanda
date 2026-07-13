// Гейт модуля «Радар контента» (/kwigtg). Доступ только владельцу-полигону.
// Возвращаем 404 (а не Forbidden) — скрываем существование раздела от чужих
// и от сканеров (как /admin/platform).
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { isOwnerEmail } from "@/lib/owner"

export default async function RadarLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!isOwnerEmail(session?.user?.email)) notFound()
  return <>{children}</>
}
