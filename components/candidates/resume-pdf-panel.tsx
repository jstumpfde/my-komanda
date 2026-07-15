"use client"

/**
 * ResumePdfPanel — просмотр PDF резюме кандидата ПРЯМО в интерфейсе (боковая
 * панель поверх карточки кандидата), а не в новой вкладке (заявка Юрия 15.07).
 *
 * Своего рендерера PDF мы не пишем и pdf.js не тянем (запрет на новые
 * npm-пакеты) — просто кладём <iframe> на роут resume-pdf. Роут отдаёт
 * Content-Disposition: inline, поэтому браузер рисует PDF ВСТРОЕННЫМ
 * просмотрщиком (Chrome/Edge/Firefox), у которого уже есть своя панель:
 * сохранить, печать, зум, поворот. Кнопки «Скачать»/«Печать» в шапке этой
 * панели — сознательное дублирование (Юрий явно попросил их видимыми в
 * шапке, а не только внутри тулбара вьювера — часть HR его не замечает).
 *
 * Панель открывается ПОВЕРХ карточки кандидата (candidate-drawer.tsx — тот
 * Sheet держит z-[60] при modal=false). Здесь та же схема: modal={false} +
 * прозрачный оверлей без pointer-events, чтобы карточка под панелью не
 * гасла и не блокировалась, но свой z-[70] — на ступень выше карточки.
 */

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Download, Maximize2, Minimize2, Printer } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface ResumePdfPanelProps {
  candidateId: string
  candidateName?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ResumePdfPanel({ candidateId, candidateName, open, onOpenChange }: ResumePdfPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const viewUrl = `/api/modules/hr/candidates/${candidateId}/resume-pdf`
  const downloadUrl = `${viewUrl}?download=1`

  // Свернуть развёрнутый режим при закрытии — при следующем открытии панель
  // снова стартует стандартного размера (тот же приём, что у карточки
  // кандидата, см. candidate-drawer.tsx).
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  // Роут может ответить 404/400/502 (нет привязки к резюме, hh не подключён,
  // резюме скрыто кандидатом) — если посадить <iframe> сразу на URL, браузер
  // красиво отрисует внутри него голый JSON { error: "..." }, что уродливо.
  // Поэтому ПЕРЕД показом iframe делаем отдельный fetch и проверяем res.ok:
  //   - HEAD технически не нужен: route.ts экспортирует только GET, а Next.js
  //     (проверено в исходниках next/dist — auto-implement-methods.js) в этом
  //     случае реализует HEAD, ПРОСТО ВЫЗЫВАЯ ТУ ЖЕ функцию GET целиком — то
  //     есть HEAD не экономит ни одного похода в hh.ru (роут не может отдать
  //     статус, не сделав fetch резюме и PDF внутри hh.ru). Разницы в цене
  //     между HEAD и GET здесь нет, поэтому используем обычный GET.
  //   - Тело НЕ читаем целиком при res.ok — иначе PDF (может быть несколько
  //     МБ) скачивался бы дважды: один раз тут впустую, второй раз — самим
  //     <iframe> по src. Явно отменяем поток через res.body?.cancel().
  //   - При !res.ok тело маленькое (apiError JSON) — читаем его ради текста
  //     ошибки для пользователя.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(viewUrl)
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          res.body?.cancel().catch(() => {})
          return
        }
        let message = "Не удалось загрузить PDF резюме"
        try {
          const data = await res.json()
          if (data && typeof data.error === "string" && data.error.trim()) {
            message = data.error
          }
        } catch {
          // тело не JSON — оставляем дефолтное сообщение
        }
        setError(message)
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить PDF резюме")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, viewUrl])

  const handlePrint = () => {
    // Роут — same-origin, поэтому contentWindow.print() разрешён без CORS-
    // ограничений. try/catch + фолбэк на всякий случай (напр. если вьювер
    // конкретного браузера не даёт доступ к contentWindow) — кнопка не
    // должна молчать при клике.
    try {
      const win = iframeRef.current?.contentWindow
      if (!win) throw new Error("no content window")
      win.focus()
      win.print()
    } catch {
      window.open(viewUrl, "_blank")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        overlayClassName="bg-transparent pointer-events-none"
        className={cn(
          "w-full p-0 flex flex-col z-[70]",
          expanded ? "max-w-none sm:max-w-none w-screen" : "sm:max-w-3xl",
        )}
      >
        {/* Развернуть на весь экран — левее стандартного крестика Radix,
            визуально копирует ту же кнопку у карточки кандидата. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Свернуть панель" : "Развернуть на весь экран"}
          className="absolute right-12 top-4 z-20 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0">
            <SheetTitle className="truncate">{candidateName || "Кандидат"}</SheetTitle>
            <SheetDescription>Резюме PDF</SheetDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0 mr-8">
            <a
              href={downloadUrl}
              title="Скачать"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={handlePrint}
              title="Печать"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <SheetBody className="p-0 flex-1 min-h-0">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <svg className="animate-spin size-6" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm">Загрузка PDF…</span>
              </div>
            </div>
          ) : error ? (
            <div className="h-full w-full flex items-center justify-center p-6">
              <div className="flex flex-col items-center gap-3 text-center max-w-sm">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Открыть в новой вкладке
                </a>
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={`${viewUrl}#toolbar=1`}
              title={`Резюме PDF${candidateName ? ` — ${candidateName}` : ""}`}
              className="w-full h-full border-0"
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
