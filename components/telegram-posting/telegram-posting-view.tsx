"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Send } from "lucide-react"
import { TelegramAccountSection, type AccountStatus } from "./telegram-account-section"
import { TelegramChatsSection, type ChatRow } from "./telegram-chats-section"
import { TelegramPostsSection, type PostRow } from "./telegram-posts-section"
import { TelegramLeadsSection, type LeadRow } from "./telegram-leads-section"
import { TelegramAnalyticsSection, type ChannelAnalyticsRow } from "./telegram-analytics-section"
import { toast } from "sonner"

interface Props {
  defaultCategory: "vacancy" | "product"
  title: string
}

interface AnalyticsData {
  items: ChannelAnalyticsRow[]
  totals: { postsSent: number; clicks: number; leads: number; spend: number; cpl: number | null }
}

export function TelegramPostingView({ defaultCategory, title }: Props) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const [chats, setChats] = useState<ChatRow[]>([])
  const [chatsLoading, setChatsLoading] = useState(true)

  const [posts, setPosts] = useState<PostRow[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)

  const [analytics, setAnalytics] = useState<AnalyticsData>({
    items: [],
    totals: { postsSent: 0, clicks: 0, leads: 0, spend: 0, cpl: null },
  })
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

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

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/leads")
      const data = await res.json()
      if (res.ok) setLeads(data.items ?? [])
    } finally { setLeadsLoading(false) }
  }, [])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const res = await fetch("/api/modules/telegram-posting/analytics")
      const data = await res.json()
      if (res.ok) setAnalytics({ items: data.items ?? [], totals: data.totals })
    } finally { setAnalyticsLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])
  useEffect(() => { loadChats() }, [loadChats])
  useEffect(() => { loadPosts() }, [loadPosts])
  useEffect(() => { loadLeads() }, [loadLeads])
  useEffect(() => { loadAnalytics() }, [loadAnalytics])

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

  async function patchChat(id: string, patch: { category?: string | null; is_enabled?: boolean; cost_per_post?: number | null }) {
    try {
      const res = await fetch(`/api/modules/telegram-posting/chats/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось обновить чат"); return }
      await loadChats()
      await loadAnalytics()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  async function deleteChat(id: string) {
    try {
      const res = await fetch(`/api/modules/telegram-posting/chats/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Не удалось удалить чат"); return }
      toast.success("Чат удалён из реестра")
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
                Личный Telegram-аккаунт, реестр чатов, очередь отложенных постов и атрибуция источников.
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

              <Tabs defaultValue="posts">
                <TabsList>
                  <TabsTrigger value="posts">Посты</TabsTrigger>
                  <TabsTrigger value="chats">Чаты</TabsTrigger>
                  <TabsTrigger value="leads">Лиды</TabsTrigger>
                  <TabsTrigger value="analytics">Аналитика</TabsTrigger>
                </TabsList>

                <TabsContent value="posts" className="mt-4">
                  <TelegramPostsSection
                    category={defaultCategory}
                    posts={posts}
                    chats={chats}
                    loading={postsLoading}
                    onReload={async () => { await loadPosts(); await loadAnalytics() }}
                  />
                </TabsContent>

                <TabsContent value="chats" className="mt-4">
                  <TelegramChatsSection chats={chats} onPatch={patchChat} onDelete={deleteChat} />
                </TabsContent>

                <TabsContent value="leads" className="mt-4">
                  <TelegramLeadsSection chats={chats} leads={leads} loading={leadsLoading} onReload={loadLeads} />
                </TabsContent>

                <TabsContent value="analytics" className="mt-4">
                  <TelegramAnalyticsSection rows={analytics.items} totals={analytics.totals} loading={analyticsLoading} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
