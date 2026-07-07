import type { Metadata } from "next"
import TipResultClient from "./result-client"

// Метаданные — статичные (без обращения к БД: страница вне зоны данного
// агента импортирует только резолвер данных клиентским fetch по контракту
// GET /api/public/tip/shared/[token]). Заголовок конкретного разбора
// показывается в <h1> на клиенте.
export const metadata: Metadata = {
  title: "Мой разбор — Типология",
  description:
    "Персональный разбор личности по дате рождения — прикладная поведенческая типология.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Мой разбор — Типология",
    description: "Персональный разбор личности по дате рождения.",
  },
}

export default function TipResultPage() {
  return <TipResultClient />
}
