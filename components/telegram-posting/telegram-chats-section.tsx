"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Users, Hash, User as UserIcon, MessageCircle, Trash2 } from "lucide-react"

export interface ChatRow {
  id: string
  tgPeerId: string
  title: string
  type: string
  category: string | null
  isEnabled: boolean
  costPerPost: string | null
}

const TYPE_ICON: Record<string, typeof Users> = { group: Users, channel: Hash, user: UserIcon }
const TYPE_LABEL: Record<string, string> = { group: "Группа", channel: "Канал", user: "Личка" }

interface Props {
  chats: ChatRow[]
  onPatch: (id: string, patch: { category?: string | null; is_enabled?: boolean; cost_per_post?: number | null }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function CostInput({ chat, onPatch }: { chat: ChatRow; onPatch: Props["onPatch"] }) {
  const [value, setValue] = useState(chat.costPerPost ?? "")

  function commit() {
    const trimmed = value.trim()
    if (trimmed === (chat.costPerPost ?? "")) return
    if (!trimmed) { onPatch(chat.id, { cost_per_post: null }); return }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) { setValue(chat.costPerPost ?? ""); return }
    onPatch(chat.id, { cost_per_post: n })
  }

  return (
    <Input
      className="h-8 w-[100px] text-xs text-right"
      inputMode="decimal"
      placeholder="—"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
    />
  )
}

export function TelegramChatsSection({ chats, onPatch, onDelete }: Props) {
  async function handleDelete(c: ChatRow) {
    if (!window.confirm(`Удалить «${c.title}» из реестра? Если по чату уже есть посты/клики — потребуется отключить вместо удаления.`)) return
    await onDelete(c.id)
  }

  return (
    <div className="rounded-xl border border-border shadow-sm bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Чаты</h2>
        <span className="ml-auto text-xs text-muted-foreground">{chats.length} шт.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">Название</th>
              <th className="px-4 py-2.5 font-medium">Тип</th>
              <th className="px-4 py-2.5 font-medium">Категория</th>
              <th className="px-4 py-2.5 font-medium text-right">₽/пост</th>
              <th className="px-4 py-2.5 font-medium text-center">Включён</th>
              <th className="px-4 py-2.5 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {chats.map((c) => {
              const Icon = TYPE_ICON[c.type] ?? MessageCircle
              return (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium max-w-[320px] truncate" title={c.title}>{c.title}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" /> {TYPE_LABEL[c.type] ?? c.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Select
                      value={c.category ?? "none"}
                      onValueChange={(v) => onPatch(c.id, { category: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="job">Job-борда</SelectItem>
                        <SelectItem value="product">Маркетинг</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <CostInput chat={c} onPatch={onPatch} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Switch checked={c.isEnabled} onCheckedChange={(v) => onPatch(c.id, { is_enabled: v })} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
            {chats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Чатов ещё нет — подключите аккаунт и нажмите «Обновить список чатов».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
