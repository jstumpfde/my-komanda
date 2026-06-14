"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// «Рабочий стол» — быстрый вход: открывает последнюю открытую вакансию
// (localStorage "hr:last-vacancy"), либо первую активную, минуя «Все вакансии».
// Редирект устроен максимально надёжно: если есть запомненная вакансия —
// уходим в неё мгновенно (без ожидания сети); иначе тянем первую активную;
// плюс жёсткая страховка через 4 сек на случай зависшего fetch.
export default function HrWorkspaceRedirect() {
  const router = useRouter()

  useEffect(() => {
    let navigated = false
    const goVacancy = (vacId: string) => {
      navigated = true
      router.replace(`/hr/vacancies/${vacId}?nav=v2&tab=candidates`)
    }

    // 1. Оптимистично: запомненная вакансия → открываем сразу.
    let lastId: string | null = null
    try {
      lastId = localStorage.getItem("hr:last-vacancy")
    } catch {}
    if (lastId) {
      goVacancy(lastId)
      return
    }

    // 2. Иначе — первая активная вакансия.
    fetch("/api/modules/hr/vacancies?scope=active&limit=100", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (navigated) return
        const list: Array<{ id: string }> = Array.isArray(data?.vacancies) ? data.vacancies : []
        if (list[0]?.id) {
          goVacancy(list[0].id)
        } else {
          navigated = true
          router.replace("/hr/vacancies")
        }
      })
      .catch(() => {
        if (!navigated) {
          navigated = true
          router.replace("/hr/vacancies")
        }
      })

    // 3. Страховка: если за 4 сек так и не ушли — жёсткий переход на список.
    const safety = setTimeout(() => {
      if (!navigated) window.location.assign("/hr/vacancies")
    }, 4000)
    return () => clearTimeout(safety)
  }, [router])

  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Открываем рабочий стол…
    </div>
  )
}
