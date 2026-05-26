import { TestClient } from "./test-client"

// Публичная страница тестового задания для кандидата. Тонкая серверная обёртка:
// данные тянет клиент из /api/public/test/[token] (token — единственный ключ).
export default async function TestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <TestClient token={token} />
}
