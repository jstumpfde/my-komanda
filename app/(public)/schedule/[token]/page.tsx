import { ScheduleClientPage } from "./schedule-client"
import { fetchScheduleData } from "./schedule-data"

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
