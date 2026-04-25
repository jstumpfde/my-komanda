"use client"

import { Clock, Send, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export type RoutinePreview = {
  type?: string
  title?: string
  description?: string
  trigger?: { type?: string; value?: string }
  sources?: Array<{ name?: string; detail?: string }>
  output?: { channel?: string; destination?: string }
  model?: string
  estimated_runs_per_month?: number
}

type Props = {
  data: RoutinePreview
  onEdit: () => void
}

export function RoutinePreviewCard({ data, onEdit }: Props) {
  const handleCreate = () => {
    toast.success("Спасибо!", {
      description:
        "Автоматизация будет доступна в Q2 2026. Мы записали вас в список первых пользователей.",
      duration: 6000,
    })
  }

  const title = data.title || "Новая автоматизация"
  const description = data.description || ""
  const triggerValue = data.trigger?.value || "—"
  const sources = Array.isArray(data.sources) ? data.sources : []
  const channel = data.output?.channel || "—"
  const destination = data.output?.destination || ""
  const model = data.model || "Нэнси Лайт"
  const runs = data.estimated_runs_per_month

  return (
    <div className="w-full rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-900 p-5 shadow-lg shadow-indigo-950/30 text-slate-100">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight leading-tight">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-slate-300/80 mt-1 leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Trigger */}
      <Section icon={<Clock className="size-4 text-indigo-300" />} label="Когда запускается">
        <span className="text-sm text-slate-100">{triggerValue}</span>
      </Section>

      {/* Sources */}
      <Section icon={<Zap className="size-4 text-indigo-300" />} label="Откуда данные">
        {sources.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 px-2.5 py-1 text-xs"
                title={s.detail}
              >
                {s.name || "источник"}
                {s.detail && (
                  <span className="text-indigo-300/60">· {s.detail}</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        )}
      </Section>

      {/* Output */}
      <Section icon={<Send className="size-4 text-indigo-300" />} label="Куда отправляется">
        <span className="text-sm text-slate-100">
          <span className="font-medium">{channel}</span>
          {destination && <span className="text-slate-300/80"> · {destination}</span>}
        </span>
      </Section>

      {/* Meta */}
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          Движок: <span className="text-slate-200">{model}</span>
        </span>
        {typeof runs === "number" && (
          <span>
            Запусков в месяц: <span className="text-slate-200">{runs}</span>
          </span>
        )}
      </div>

      {/* CTAs */}
      <div className="mt-5 flex gap-2">
        <Button
          onClick={handleCreate}
          className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 border-0"
        >
          Создать автоматизацию
        </Button>
        <Button
          onClick={onEdit}
          variant="outline"
          className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-slate-50"
        >
          Изменить
        </Button>
      </div>
    </div>
  )
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  )
}
