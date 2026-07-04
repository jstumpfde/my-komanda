"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Send } from "lucide-react"
import { TelegramAccountSection, type AccountStatus } from "./telegram-account-section"
import { TelegramChatsSection, type ChatRow } from "./telegram-chats-section"
import { TelegramPostsSection, type PostRow } from "./telegram-posts-section"
import { toast } from "sonner"

interface Props {
  defaultCategory: "vacancy" | "product"
  title: string
}

export function TelegramPostingView({ defaultCategory, title }: Props) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const [chats, setChats] = useState<ChatRow[]>([])
  const [chatsLoading, setChatsLoading] = useState(true)

  const [posts, setPosts] = useState<PostRow[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/connect")
      const data = await res.json()
      if (res.ok) setStatus(data)
    } finally { setStatusLoading(false) }
  }, [])

  const loadChats = useCallback(async () => {
    setChatsLoading(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/chats")
      const data = await res.json()
      if (res.ok) setChats(data.items ?? [])
    } finally { setChatsLoading(false) }
  }, [])

  const loadPosts = useCallback(async () => {
    setPostsLoading(true)
    try {
      const res = await fetch(`/api/modules/telegram-posting/posts?category=${defaultCategory}`)
      const data = await res.json()
      if (res.ok) setPosts(data.items ?? [])
    } finally { setPostsLoading(false) }
  }, [defaultCategory])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { loadChats() }, [loadChats])
  useEffect(() => { loadPosts() }, [loadPosts])

  async function syncChats() {
    setSyncing(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/chats/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось синхронизировать чаты"); return }
      toast.success(`Синхронизировано: ${data.synced} из ${data.total}`)
      await loadChats()
    } catch {
      toast.error("Ошибка сети")
    } finally { setSyncing(false) }
  }

  async function patchChat(id: string, patch: { category?: string | null; is_enabled?: boolean }) {
    try {
      const res = await fetch(`/api/modules/telegram-posting/chats/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось обновить чат"); return }
      await loadChats()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="mb-6">
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Send className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">{title}</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Личный Telegram-аккаунт, реестр чатов и очередь отложенных постов с расписанием.
              </p>
            </div>

            <div className="space-y-6">
              <TelegramAccountSection
                status={status}
                loading={statusLoading}
                onReload={loadStatus}
                onSyncChats={syncChats}
                syncing={syncing}
              />

              <TelegramChatsSection chats={chats} onPatch={patchChat} />

              <TelegramPostsSection
                category={defaultCategory}
                posts={posts}
                chats={chats}
                loading={postsLoading}
                onReload={loadPosts}
              />
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
