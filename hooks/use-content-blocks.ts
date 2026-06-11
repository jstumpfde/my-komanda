"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import type { Lesson } from "@/lib/course-types"

export type ContentType = "presentation" | "test" | "task"

export interface ContentBlock {
  id: string
  vacancyId: string
  kind: string
  contentType: ContentType
  title: string
  status: "draft" | "published"
  lessons: Lesson[]
  sortOrder: number
  createdAt: string
  updatedAt: string
  postDemoSettings?: Record<string, unknown>
  /** Блок является «боевым» — его данные синкаются в kind='test'/'demo' (dual-write). */
  isLiveBattle: boolean
}

interface ApiContentBlock {
  id: string
  vacancyId: string
  kind: string
  contentType: string
  title: string
  status: string
  lessonsJson: Lesson[]
  sortOrder: number
  createdAt: string
  updatedAt: string
  postDemoSettings?: Record<string, unknown>
}

function apiBlockToBlock(d: ApiContentBlock): ContentBlock {
  const ct = d.contentType === "test" || d.contentType === "task" ? d.contentType : "presentation"
  const settings = d.postDemoSettings ?? {}
  return {
    id: d.id,
    vacancyId: d.vacancyId,
    kind: d.kind,
    contentType: ct as ContentType,
    title: d.title,
    status: (d.status === "published" ? "published" : "draft") as "draft" | "published",
    lessons: d.lessonsJson ?? [],
    sortOrder: d.sortOrder ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    postDemoSettings: settings,
    isLiveBattle: settings.isLiveBattle === true,
  }
}

export type BlockPatch = {
  title?: string
  contentType?: ContentType
  lessons?: Lesson[]
  status?: "draft" | "published"
  isLiveBattle?: boolean
}

interface UseContentBlocksResult {
  blocks: ContentBlock[]
  loading: boolean
  error: string | null
  createBlock: (contentType: ContentType, title: string) => Promise<ContentBlock | null>
  updateBlock: (id: string, patch: BlockPatch) => void
  saveSettings: (id: string, settings: Record<string, unknown>) => Promise<void>
  deleteBlock: (id: string) => Promise<boolean>
  reorder: (idsInOrder: string[]) => Promise<void>
  /** Назначить/снять флаг «боевой» для блока. Если назначаем — сбрасываем у остальных блоков того же типа. */
  setLiveBattle: (id: string, isLive: boolean) => Promise<void>
}

export function useContentBlocks(vacancyId: string | null): UseContentBlocksResult {
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Дебаунс-рефы для каждого блока (по id)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPatches = useRef<Record<string, BlockPatch>>({})

  const load = useCallback(async () => {
    if (!vacancyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}&list=1`
      )
      if (!res.ok) throw new Error("load failed")
      const json = await res.json() as { data?: ApiContentBlock[] } | ApiContentBlock[]
      const rows: ApiContentBlock[] = (json as { data?: ApiContentBlock[] }).data
        ?? (json as ApiContentBlock[])
      if (Array.isArray(rows)) {
        // Показываем ВСЕ блоки вакансии, включая легаси kind='demo'/'test'
        // (они = первые блоки списка для преемственности). Рантайм по-прежнему
        // читает легаси-записи по kind — правка их здесь это поведение сохраняет.
        setBlocks(rows.map(apiBlockToBlock))
      }
    } catch {
      setError("Не удалось загрузить блоки контента")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => {
    load()
  }, [load])

  const persistUpdate = useCallback(async (id: string, patch: BlockPatch) => {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.contentType !== undefined) body.content_type = patch.contentType
    if (patch.lessons !== undefined) body.lessons_json = patch.lessons
    if (patch.status !== undefined) body.status = patch.status
    // isLiveBattle хранится внутри post_demo_settings (merge-patch)
    if (patch.isLiveBattle !== undefined) {
      body.post_demo_settings = { isLiveBattle: patch.isLiveBattle }
    }
    try {
      const res = await fetch(`/api/modules/hr/demos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("save failed")
    } catch {
      // Оптимистичный апдейт в state остаётся, но НЕ молчим — иначе HR думает,
      // что сохранилось, а данные потеряны (тип блока/«боевой»/контент).
      toast.error("Не удалось сохранить изменения блока — проверьте соединение")
    }
  }, [])

  const createBlock = useCallback(async (
    contentType: ContentType,
    title: string
  ): Promise<ContentBlock | null> => {
    if (!vacancyId) return null
    try {
      const res = await fetch("/api/modules/hr/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancy_id: vacancyId,
          title,
          content_type: contentType,
          // kind не передаём — API сгенерирует 'block:<uuid>'
        }),
      })
      if (!res.ok) throw new Error("create failed")
      const json = await res.json() as { data?: ApiContentBlock } | ApiContentBlock
      const row = ((json as { data?: ApiContentBlock }).data ?? json) as ApiContentBlock
      const block = apiBlockToBlock(row)
      setBlocks(prev => [...prev, block])
      return block
    } catch {
      return null
    }
  }, [vacancyId])

  const updateBlock = useCallback((id: string, patch: BlockPatch) => {
    // Оптимистичный апдейт
    setBlocks(prev => prev.map(b => {
      if (b.id !== id) return b
      return {
        ...b,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.contentType !== undefined ? { contentType: patch.contentType } : {}),
        ...(patch.lessons !== undefined ? { lessons: patch.lessons } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.isLiveBattle !== undefined ? {
          isLiveBattle: patch.isLiveBattle,
          postDemoSettings: { ...(b.postDemoSettings ?? {}), isLiveBattle: patch.isLiveBattle },
        } : {}),
      }
    }))

    // Накапливаем патч
    pendingPatches.current[id] = { ...pendingPatches.current[id], ...patch }

    // lessons — дебаунс 700мс, остальное — сразу
    const hasLessonsOnly = patch.lessons !== undefined &&
      Object.keys(patch).every(k => k === "lessons")

    if (hasLessonsOnly) {
      if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id])
      debounceRefs.current[id] = setTimeout(() => {
        const accumulated = pendingPatches.current[id]
        if (accumulated) {
          delete pendingPatches.current[id]
          persistUpdate(id, accumulated)
        }
      }, 700)
    } else {
      // title/contentType/status — сохраняем немедленно (flush накопленный + новый)
      if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id])
      const accumulated = pendingPatches.current[id]
      if (accumulated) {
        delete pendingPatches.current[id]
        persistUpdate(id, accumulated)
      }
    }
  }, [persistUpdate])

  const deleteBlock = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/demos/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("delete failed")
      setBlocks(prev => prev.filter(b => b.id !== id))
      return true
    } catch {
      return false
    }
  }, [])

  const saveSettings = useCallback(async (id: string, settings: Record<string, unknown>) => {
    // Оптимистичный апдейт postDemoSettings
    setBlocks(prev => prev.map(b => {
      if (b.id !== id) return b
      return { ...b, postDemoSettings: { ...(b.postDemoSettings ?? {}), ...settings } }
    }))
    try {
      await fetch(`/api/modules/hr/demos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_demo_settings: settings }),
      })
    } catch { /* silent — оптимистичный апдейт уже применён */ }
  }, [])

  const reorder = useCallback(async (idsInOrder: string[]) => {
    // Оптимистичный апдейт sort_order
    setBlocks(prev => {
      const byId = new Map(prev.map(b => [b.id, b]))
      return idsInOrder.map((id, i) => {
        const b = byId.get(id)
        return b ? { ...b, sortOrder: i } : null
      }).filter((b): b is ContentBlock => b !== null)
    })

    // Сохраняем на сервере только изменившиеся
    const currentOrder = blocks.map(b => b.id)
    const changed = idsInOrder
      .map((id, i) => ({ id, newOrder: i, oldOrder: currentOrder.indexOf(id) }))
      .filter(({ newOrder, oldOrder }) => newOrder !== oldOrder)

    await Promise.all(
      changed.map(({ id, newOrder }) =>
        fetch(`/api/modules/hr/demos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: newOrder }),
        }).catch(() => {})
      )
    )
  }, [blocks])

  /**
   * Назначить/снять флаг «боевой» для блока.
   * При назначении — сбрасываем isLiveBattle у остальных блоков того же contentType
   * (только один боевой на тип), потом устанавливаем у выбранного.
   */
  const setLiveBattle = useCallback(async (id: string, isLive: boolean) => {
    const block = blocks.find(b => b.id === id)
    if (!block) return

    if (isLive) {
      // Сброс у остальных блоков того же contentType (optimistic + persist)
      const others = blocks.filter(b => b.id !== id && b.contentType === block.contentType && b.isLiveBattle)
      for (const other of others) {
        setBlocks(prev => prev.map(b => b.id === other.id
          ? { ...b, isLiveBattle: false, postDemoSettings: { ...(b.postDemoSettings ?? {}), isLiveBattle: false } }
          : b
        ))
        // Если сброс у старого боевого не записался — будут ДВА боевых блока
        // одного типа, кандидаты получат не тот контент. Поэтому не молчим.
        await fetch(`/api/modules/hr/demos/${other.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_demo_settings: { isLiveBattle: false } }),
        }).then(r => { if (!r.ok) throw new Error() }).catch(() => toast.error("Не удалось снять «боевой» у предыдущего блока — обновите страницу"))
      }
    }

    // Устанавливаем/снимаем у выбранного
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, isLiveBattle: isLive, postDemoSettings: { ...(b.postDemoSettings ?? {}), isLiveBattle: isLive } }
      : b
    ))
    await fetch(`/api/modules/hr/demos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_demo_settings: { isLiveBattle: isLive } }),
    }).then(r => { if (!r.ok) throw new Error() }).catch(() => toast.error("Не удалось сохранить «боевой» статус блока"))
  }, [blocks])

  return { blocks, loading, error, createBlock, updateBlock, saveSettings, deleteBlock, reorder, setLiveBattle }
}
