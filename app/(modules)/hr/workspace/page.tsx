"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// «Рабочий стол» — быстрый вход: открывает последнюю открытую вакансию
// (localStorage "hr:last-vacancy"), либо первую активную, минуя «Все вакансии».
// Если активных вакансий нет — отправляем на общий список.
export default function HrWorkspaceRedirect() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function go() {
      try {
        const res = await fetch("/api/modules/hr/vacancies?scope=active&limit=100", {
          cache: "no-store",
        })
        const data = await res.json().catch(() => null)
        const list: Array<{ id: string }> = Array.isArray(data?.vacancies) ? data.vacancies : []

        if (cancelled) return

        if (list.length === 0) {
          router.replace("/hr/vacancies")
          return
        }

        let lastId: string | null = null
        try {
          lastId = localStorage.getItem("hr:last-vacancy")
        } catch {}

        const target =
          (lastId && list.find((v) => v.id === lastId)) || list[0]

        router.replace(`/hr/vacancies/${target.id}?nav=v2&tab=candidates`)
      } catch {
        if (!cancelled) router.replace("/hr/vacancies")
      }
    }

    go()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Открываем рабочий стол…
    </div>
  )
}
