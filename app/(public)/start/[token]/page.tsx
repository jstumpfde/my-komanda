import { StartClient } from "./start-client"

// Публичная страница универсальной (обезличенной) ссылки на контент-блок
// вакансии — /start/[publicToken] (см. drizzle/0278). В отличие от /demo и
// /test, здесь НЕТ кандидата на входе: тонкая серверная обёртка, вся логика —
// в клиенте (форма «Имя+Телефон» → /api/public/start/[token] → редирект на
// персональный /demo или /test).
export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <StartClient token={token} />
}
