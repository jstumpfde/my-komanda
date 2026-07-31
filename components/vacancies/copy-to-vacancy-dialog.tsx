"use client"

// Диалог «Дублировать в вакансию…» / «Скопировать в другую вакансию…» —
// кросс-вакансийная копия блока контента целиком или одного урока.
// Быстрый путь В ПРЕДЕЛАХ одной вакансии (submenu «Скопировать в блок…»,
// кнопка «Дублировать блок») остаётся клиентским — этот диалог только для
// переноса контента МЕЖДУ вакансиями (нужна серверная сторона: обе вакансии
// проверяются на принадлежность компании — POST .../content-blocks/copy).

import { useEffect, useMemo, useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronLeft, Briefcase, FileText, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useVacancies } from "@/hooks/use-vacancies"
import { visibleContentBlocks, type ContentBlock, type ContentType } from "@/hooks/use-content-blocks"

interface DemoApiRow {
  id: string
  vacancyId: string
  kind: string
  contentType: string
  title: string
  status: string
  lessonsJson: unknown
  sortOrder: number
  createdAt: string
  updatedAt: string
  postDemoSettings?: Record<string, unknown> | null
}

function mapRow(d: DemoApiRow): ContentBlock {
  const settings = d.postDemoSettings ?? {}
  return {
    id: d.id,
    vacancyId: d.vacancyId,
    kind: d.kind,
    contentType: (d.contentType === "test" || d.contentType === "task" ? d.contentType : "presentation") as ContentType,
    title: d.title,
    status: d.status === "published" ? "published" : "draft",
    lessons: Array.isArray(d.lessonsJson) ? (d.lessonsJson as ContentBlock["lessons"]) : [],
    sortOrder: d.sortOrder ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    postDemoSettings: settings,
    isLiveBattle: settings.isLiveBattle === true,
  }
}

interface CopyToVacancyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Вакансия-источник (текущая, откуда копируем). */
  sourceVacancyId: string
  /** Блок-источник (целиком копируем, либо берём из него один урок). */
  sourceBlockId: string
  /** Если задан — копируем ОДИН урок (нужен ещё выбор целевого блока).
   *  Если не задан — копируется блок целиком (в конец списка блоков цели). */
  lessonId?: string
  /** Человекочитаемое имя копируемой сущности для заголовка диалога. */
  entityLabel: string
  onCopied: (result: { targetVacancyTitle: string; targetBlockTitle: string }) => void
}

export function CopyToVacancyDialog({
  open, onOpenChange, sourceVacancyId, sourceBlockId, lessonId, entityLabel, onCopied,
}: CopyToVacancyDialogProps) {
  const { vacancies, loading: vacanciesLoading } = useVacancies(1, 200)
  const [targetVacancyId, setTargetVacancyId] = useState<string | null>(null)
  const [targetBlocks, setTargetBlocks] = useState<ContentBlock[]>([])
  const [blocksLoading, setBlocksLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const otherVacancies = useMemo(
    () => vacancies.filter(v => v.id !== sourceVacancyId),
    [vacancies, sourceVacancyId]
  )

  // Сброс шагов при закрытии диалога
  useEffect(() => {
    if (!open) {
      setTargetVacancyId(null)
      setTargetBlocks([])
      setSubmitting(false)
    }
  }, [open])

  const targetVacancy = otherVacancies.find(v => v.id === targetVacancyId) ?? null

  // Копирование урока: после выбора вакансии подгружаем её блоки для 2-го шага.
  useEffect(() => {
    if (!targetVacancyId || !lessonId) return
    let cancelled = false
    setBlocksLoading(true)
    fetch(`/api/modules/hr/demos?vacancy_id=${encodeURIComponent(targetVacancyId)}&list=1`)
      .then(r => r.json())
      .then((json: { data?: DemoApiRow[] } | DemoApiRow[]) => {
        if (cancelled) return
        const rows = Array.isArray(json) ? json : (json.data ?? [])
        setTargetBlocks(visibleContentBlocks(rows.map(mapRow)))
      })
      .catch(() => { if (!cancelled) toast.error("Не удалось загрузить блоки вакансии") })
      .finally(() => { if (!cancelled) setBlocksLoading(false) })
    return () => { cancelled = true }
  }, [targetVacancyId, lessonId])

  const doCopy = async (targetBlockId: string | undefined, fallbackTitle: string) => {
    if (!targetVacancyId || !targetVacancy) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${sourceVacancyId}/content-blocks/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBlockId, lessonId, targetVacancyId, targetBlockId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось скопировать")
        setSubmitting(false)
        return
      }
      onCopied({
        targetVacancyTitle: targetVacancy.title,
        targetBlockTitle: typeof data.targetBlockTitle === "string" ? data.targetBlockTitle : fallbackTitle,
      })
    } catch {
      toast.error("Не удалось скопировать — проверьте соединение")
      setSubmitting(false)
    }
  }

  // Режим «блок целиком» — выбор вакансии сразу запускает копирование
  // (второго шага нет: сервер сам создаёт новый блок в конце списка цели).
  const handlePickVacancyForBlock = (vacancyId: string) => {
    setTargetVacancyId(vacancyId)
  }
  useEffect(() => {
    if (targetVacancyId && !lessonId && !submitting) {
      doCopy(undefined, "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetVacancyId])

  const step: "vacancy" | "block" = lessonId && targetVacancyId ? "block" : "vacancy"

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "block" && (
              <Button
                variant="ghost" size="icon" className="h-6 w-6 -ml-1"
                onClick={() => setTargetVacancyId(null)}
                title="Назад к выбору вакансии"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            {step === "vacancy" ? "Выберите вакансию" : "Выберите блок"}
          </DialogTitle>
          <DialogDescription>
            {step === "vacancy"
              ? <>Скопировать {entityLabel} в другую вакансию компании.</>
              : <>Вакансия «{targetVacancy?.title}» — в какой блок добавить {entityLabel}?</>}
          </DialogDescription>
        </DialogHeader>

        {step === "vacancy" ? (
          vacanciesLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />Загрузка вакансий…
            </div>
          ) : otherVacancies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Других вакансий в компании нет
            </p>
          ) : (
            <Command>
              <CommandInput placeholder="Поиск вакансии…" className="h-9 text-sm" />
              <CommandList className="max-h-72">
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">Не найдено</CommandEmpty>
                <CommandGroup>
                  {otherVacancies.map((v) => (
                    <CommandItem
                      key={v.id}
                      value={v.title}
                      disabled={submitting}
                      onSelect={() => lessonId ? setTargetVacancyId(v.id) : handlePickVacancyForBlock(v.id)}
                      className="text-sm gap-2 cursor-pointer"
                    >
                      <Briefcase className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{v.title}</span>
                      {v.city && <span className="text-[10px] text-muted-foreground shrink-0">{v.city}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )
        ) : blocksLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />Загрузка блоков…
          </div>
        ) : targetBlocks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            В этой вакансии ещё нет блоков контента
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
            {targetBlocks.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={submitting}
                onClick={() => doCopy(b.id, b.title)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors disabled:opacity-50"
              >
                {b.contentType === "presentation"
                  ? <Sparkles className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                  : <FileText className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
                <span className="truncate flex-1">{b.title}</span>
              </button>
            ))}
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />Копируем…
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
