import { Suspense } from "react"
import { InterviewsView } from "../interviews/page"

/**
 * /hr/calendar — отдельный пункт меню «Календарь».
 * Чистый календарь компании (без интервью-интерфейса: списки/канбан/фильтры).
 * Управление интервью живёт в Рабочем столе → таб «Интервью».
 */
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <InterviewsView calendarOnly />
    </Suspense>
  )
}
