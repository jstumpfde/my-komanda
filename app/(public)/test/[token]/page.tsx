import type { Metadata } from "next"
import { TestClient } from "./test-client"
import { candidateLinkMetadata } from "@/lib/public/candidate-link-meta"

// OG-превью для кандидата: вакансия работодателя, без платформенного логотипа.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  return candidateLinkMetadata(token)
}

// Публичная страница тестового задания для кандидата. Тонкая серверная обёртка:
// данные тянет клиент из /api/public/test/[token] (token — единственный ключ).
export default async function TestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <TestClient token={token} />
}
