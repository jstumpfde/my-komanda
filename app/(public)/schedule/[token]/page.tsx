import type { Metadata } from "next"
import { ScheduleClientPage } from "./schedule-client"
import { fetchScheduleData } from "./schedule-data"
import { candidateLinkMetadata } from "@/lib/public/candidate-link-meta"

// OG-превью для кандидата: вакансия работодателя, без платформенного логотипа.
// Без этого страница наследует site-wide og:image из app/layout.tsx, и hh.ru
// рисует большой платформенный логотип в превью ссылки самозаписи.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  return candidateLinkMetadata(token)
}

// Серверный компонент — загружает данные из БД напрямую,
// передаёт в клиентский компонент.
export default async function SchedulePublicPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { data, error } = await fetchScheduleData(token)

  return <ScheduleClientPage token={token} initialData={data} initialError={error} />
}
