"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Users } from "lucide-react"
import type { ChatRow } from "./telegram-chats-section"

export interface LeadRow {
  id: string
  tgUserId: string
  tgUsername: string | null
  displayName: string | null
  firstMessageAt: string
  firstMessageText: string | null
  sourceChatId: string | null
  sourceChatTitle: string | null
  sourceConfidence: string | null
  candidateChatTitles: string[] | null
  notes: string | null
}

const CONFIDENCE_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  common_chat: { label: "Общий чат", variant: "default" },
  ambiguous:   { label: "Похоже — уточните", variant: "secondary" },
  keyword:     { label: "По содержанию", variant: "secondary" },
  timing:      { label: "По времени (слабый)", variant: "outline" },
  manual:      { label: "Вручную", variant: "outline" },
}

interface Props {
  leads: LeadRow[]
  chats: ChatRow[]
  loading: boolean
  onReload: () => Promise<void>
}

export function TelegramLeadsSection({ leads, chats, loading, onReload }: Props) {
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})

  async function patchLead(id: string, patch: { source_chat_id?: string | null; notes?: string }) {
    try {
      const res = await fetch(`/api/modules/telegram-posting/leads/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось обновить лид"); return }
      await onReload()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  return (
    <div className="rounded-xl border border-border shadow-sm bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Users className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Лиды из личных сообщений</h2>
        <span className="ml-auto text-xs text-muted-foreground">{leads.length} шт.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">Имя / username</th>
              <th className="px-4 py-2.5 font-medium">Первое сообщение</th>
              <th className="px-4 py-2.5 font-medium">Когда</th>
              <th className="px-4 py-2.5 font-medium">Источник</th>
              <th className="px-4 py-2.5 font-medium">Уверенность</th>
              <th className="px-4 py-2.5 font-medium">Заметка</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            )}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Лидов ещё нет — появятся автоматически, когда кто-то напишет владельцу в личку после чата.
                </td>
              </tr>
            )}
            {!loading && leads.map((l) => {
              const conf = l.sourceConfidence ? CONFIDENCE_LABEL[l.sourceConfidence] : null
              return (
                <tr key={l.id} className="border-b border-border/50 last:border-0 align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{l.displayName || "Без имени"}</div>
                    {l.tgUsername && (
                      <a
                        href={`https://t.me/${l.tgUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-violet-600 hover:underline"
                      >
                        @{l.tgUsername}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[260px]">
                    {l.firstMessageText ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate cursor-help">{l.firstMessageText}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[320px] whitespace-pre-wrap text-xs">
                            {l.firstMessageText}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.firstMessageAt).toLocaleString("ru", { timeZone: "Europe/Moscow" })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Select
                      value={l.sourceChatId ?? "none"}
                      onValueChange={(v) => patchLead(l.id, { source_chat_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Не определён" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не определён</SelectItem>
                        {chats.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5">
                    {conf && l.candidateChatTitles && l.candidateChatTitles.length > 1 ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={conf.variant} className="cursor-help">{conf.label}</Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            Состоит сразу в нескольких ваших чатах — вероятно один из:{" "}
                            {l.candidateChatTitles.join(", ")}. Выберите верный в «Источник».
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : conf ? (
                      <Badge variant={conf.variant}>{conf.label}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 min-w-[180px]">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Заметка…"
                      defaultValue={l.notes ?? ""}
                      onChange={(e) => setNotesDraft((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      onBlur={(e) => {
                        const value = notesDraft[l.id] ?? e.target.value
                        if (value !== (l.notes ?? "")) patchLead(l.id, { notes: value })
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
