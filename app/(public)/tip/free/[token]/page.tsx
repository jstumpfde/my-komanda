import type { Metadata } from "next"
import TipFreeClient from "./free-client"

export const metadata: Metadata = {
  title: "Активация бесплатной ссылки — Типология",
  robots: { index: false, follow: false },
}

export default function TipFreePage() {
  return <TipFreeClient />
}
