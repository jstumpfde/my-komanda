import type { Metadata } from "next"
import { Suspense } from "react"
import TipClient from "./tip-client"

export const metadata: Metadata = {
  title: "Типология — персональный разбор личности по дате рождения",
  description:
    "Прикладная поведенческая типология: разбор личности, отношений и карьерных сценариев по дате рождения. Инструмент для размышления и выбора стратегии поведения.",
  openGraph: {
    title: "Типология — персональный разбор личности по дате рождения",
    description:
      "Прикладная поведенческая типология по дате рождения — разбор личности, отношений, карьеры.",
  },
}

export default function TipPage() {
  return (
    <Suspense fallback={null}>
      <TipClient />
    </Suspense>
  )
}
