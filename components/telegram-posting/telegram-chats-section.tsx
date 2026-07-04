"use client"

import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Users, Hash, User as UserIcon, MessageCircle } from "lucide-react"

export interface ChatRow {
  id: string
  tgPeerId: string
  title: string
  type: string
  category: string | null
  isEnabled: boolean
}

const TYPE_ICON: Record<string, typeof Users> = { group: Users, channel: Hash, user: UserIcon }
const TYPE_LABEL: Record<string, string> = { group: "Группа", channel: "Канал", user: "Личка" }

interface Props {
  chats: ChatRow[]
  onPatch: (id: string, patch: { category?: string | null; is_enabled?: boolean }) => Promise<void>
}

export function TelegramChatsSection({ chats, onPatch }: Props) {
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
              <th className="px-4 py-2.5 font-medium text-center">Включён</th>
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
                  <td className="px-4 py-2.5 text-center">
                    <Switch checked={c.isEnabled} onCheckedChange={(v) => onPatch(c.id, { is_enabled: v })} />
                  </td>
                </tr>
              )
            })}
            {chats.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
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
