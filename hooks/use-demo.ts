"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { type Demo, type Lesson } from "@/lib/course-types"

export interface ApiDemo {
  id: string
  vacancyId: string
  title: string
  status: "draft" | "published"
  lessonsJson: Lesson[]
  createdAt: string
  updatedAt: string
}

function apiDemoToDemo(d: ApiDemo): Demo {
  return {
    id: d.id,
    title: d.title,
    companyName: "",
    description: "",
    status: d.status,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
    coverGradientFrom: "#6366f1",
    coverGradientTo: "#8b5cf6",
    lessons: d.lessonsJson ?? [],
  }
}

interface UseDemoResult {
  demo: Demo | null
  loading: boolean
  error: string | null
  saveStatus: "saved" | "saving" | "error" | "idle"
  createDemo: (title: string, lessons: Lesson[]) => Promise<Demo | null>
  updateDemo: (updated: Demo) => void
}

export function useDemo(vacancyId: string | null, kind: "demo" | "test" = "demo"): UseDemoResult {
  const [demo, setDemo] = useState<Demo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "idle">("idle")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDemoRef = useRef<Demo | null>(null)
  // Есть несохранённые изменения. Управляет отправкой beacon при уходе со
  // страницы — чтобы при быстрой перезагрузке последняя правка не терялась.
  const dirtyRef = useRef(false)

  // Load demo on mount (kind разделяет демо/тест — Этап 2.5)
  useEffect(() => {
    if (!vacancyId) return
    setLoading(true)
    setError(null)

    fetch(`/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}&kind=${kind}`)
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then((json: { data?: ApiDemo[] }) => {
        const rows = json.data ?? (json as unknown as ApiDemo[])
        if (Array.isArray(rows) && rows.length > 0) {
          const d = apiDemoToDemo(rows[0])
          setDemo(d)
          latestDemoRef.current = d
          setSaveStatus("saved")
        }
      })
      .catch(() => setError("Не удалось загрузить демо"))
      .finally(() => setLoading(false))
  }, [vacancyId, kind])

  const persistUpdate = useCallback(async (updated: Demo) => {
    setSaveStatus("saving")
    try {
      const res = await fetch(`/api/modules/hr/demos/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updated.title,
          status: updated.status,
          lessons_json: updated.lessons,
        }),
      })
      if (!res.ok) throw new Error("save failed")
      dirtyRef.current = false
      setSaveStatus("saved")
    } catch {
      setSaveStatus("error")
    }
  }, [])

  const updateDemo = useCallback((updated: Demo) => {
    setDemo(updated)
    latestDemoRef.current = updated
    dirtyRef.current = true
    setSaveStatus("saving")

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (latestDemoRef.current) {
        persistUpdate(latestDemoRef.current)
      }
    }, 700)
  }, [persistUpdate])

  const createDemo = useCallback(async (title: string, lessons: Lesson[]): Promise<Demo | null> => {
    if (!vacancyId) return null
    setSaveStatus("saving")
    try {
      const res = await fetch("/api/modules/hr/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancy_id: vacancyId, title, lessons_json: lessons, kind }),
      })
      if (!res.ok) throw new Error("create failed")
      const json = await res.json()
      const row = (json.data ?? json) as ApiDemo
      const d = apiDemoToDemo(row)
      setDemo(d)
      latestDemoRef.current = d
      setSaveStatus("saved")
      return d
    } catch {
      setSaveStatus("error")
      return null
    }
  }, [vacancyId, kind])

  // Flush pending changes: save immediately
  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (latestDemoRef.current) {
      // Use sendBeacon-like synchronous approach — fire and forget
      persistUpdate(latestDemoRef.current).catch(() => {})
    }
  }, [persistUpdate])

  // Сохранение при уходе со страницы. Шлём beacon ПОКА ЕСТЬ несохранённые
  // изменения (dirtyRef), а не «пока тикает debounce» — иначе быстрый F5 после
  // правки терял её. pagehide/visibilitychange надёжнее beforeunload (срабатывают
  // при перезагрузке, закрытии вкладки и сворачивании, в т.ч. на мобильных).
  useEffect(() => {
    const beaconSave = () => {
      if (!dirtyRef.current || !latestDemoRef.current) return
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      const blob = new Blob(
        [JSON.stringify({
          title: latestDemoRef.current.title,
          status: latestDemoRef.current.status,
          lessons_json: latestDemoRef.current.lessons,
        })],
        { type: "application/json" }
      )
      // beacon шлёт POST → роут демо принимает POST как PUT (см. demos/[id]/route).
      const ok = navigator.sendBeacon(`/api/modules/hr/demos/${latestDemoRef.current.id}`, blob)
      if (ok) dirtyRef.current = false
    }
    const onVisibility = () => { if (document.visibilityState === "hidden") beaconSave() }
    window.addEventListener("pagehide", beaconSave)
    window.addEventListener("beforeunload", beaconSave)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", beaconSave)
      window.removeEventListener("beforeunload", beaconSave)
      document.removeEventListener("visibilitychange", onVisibility)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      // Flush on unmount too (смена вкладки внутри SPA).
      if (dirtyRef.current && latestDemoRef.current) {
        persistUpdate(latestDemoRef.current).catch(() => {})
      }
    }
  }, [persistUpdate])

  return { demo, loading, error, saveStatus, createDemo, updateDemo }
}

/** Этап 2.5: таб «Тест» — те же демо-записи в таблице demos, но kind='test'. */
export function useTest(vacancyId: string | null): UseDemoResult {
  return useDemo(vacancyId, "test")
}
