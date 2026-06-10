"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Send, Plus, Trash2, Sparkles, Copy, Check, Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface TelegramChannel {
  id: string
  name: string
  username: string
}

interface TelegramPostingProps {
  vacancyId: string
}

export function TelegramPosting({ vacancyId }: TelegramPostingProps) {
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [savingChannels, setSavingChannels] = useState(false)

  // Форма добавления канала
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newUsername, setNewUsername] = useState("")

  // Удаление
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null)

  // Генерация поста
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatedPost, setGeneratedPost] = useState("")
  const [postChannelName, setPostChannelName] = useState("")
  const [usedAi, setUsedAi] = useState(false)
  const [shortUrl, setShortUrl] = useState("")
  const [copied, setCopied] = useState(false)

  // ── Загрузка каналов из hiring-defaults ──
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/hr/company/hiring-defaults")
      if (!res.ok) return
      const data = await res.json() as { hiringDefaults?: { telegramChannels?: TelegramChannel[] } }
      setChannels(data.hiringDefaults?.telegramChannels ?? [])
    } catch {
      // silent
    } finally {
      setLoadingChannels(false)
    }
  }, [])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  // ── Сохранение каналов в hiring-defaults ──
  const saveChannels = async (updated: TelegramChannel[]) => {
    setSavingChannels(true)
    try {
      const res = await fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChannels: updated }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      setChannels(updated)
    } catch {
      toast.error("Не удалось сохранить каналы")
      await fetchChannels()
    } finally {
      setSavingChannels(false)
    }
  }

  // ── Добавление канала ──
  const handleAddChannel = async () => {
    const name = newName.trim()
    const username = newUsername.trim()
    if (!name) { toast.error("Введите название канала"); return }
    if (!username) { toast.error("Введите @username или ссылку канала"); return }

    const newChannel: TelegramChannel = {
      id: crypto.randomUUID(),
      name,
      username,
    }
    await saveChannels([...channels, newChannel])
    setNewName("")
    setNewUsername("")
    setShowAddForm(false)
    toast.success("Канал добавлен")
  }

  // ── Удаление канала ──
  const handleDeleteChannel = async () => {
    if (!deleteChannelId) return
    await saveChannels(channels.filter((c) => c.id !== deleteChannelId))
    setDeleteChannelId(null)
    if (selectedChannelId === deleteChannelId) {
      setSelectedChannelId(null)
      setGeneratedPost("")
    }
    toast.success("Канал удалён")
  }

  // ── Генерация поста ──
  const handleGeneratePost = async (channel: TelegramChannel) => {
    setSelectedChannelId(channel.id)
    setPostChannelName(channel.name)
    setGenerating(true)
    setGeneratedPost("")
    setShortUrl("")
    setUsedAi(false)
    setCopied(false)

    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/telegram-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName: channel.name, useAi: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { post: string; usedAi: boolean; shortUrl: string }
      setGeneratedPost(data.post)
      setUsedAi(data.usedAi)
      setShortUrl(data.shortUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка генерации поста")
      setSelectedChannelId(null)
    } finally {
      setGenerating(false)
    }
  }

  // ── Копирование поста ──
  const handleCopyPost = async () => {
    if (!generatedPost) return
    try {
      await navigator.clipboard.writeText(generatedPost)
      setCopied(true)
      toast.success("Пост скопирован в буфер обмена")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  // Форматируем @username / ссылку в кликабельный URL
  const channelHref = (username: string) => {
    if (username.startsWith("http")) return username
    const clean = username.startsWith("@") ? username.slice(1) : username
    return `https://t.me/${clean}`
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              Telegram-постинг
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setShowAddForm((v) => !v)}
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить канал
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Генерация готового поста для публикации в Telegram-каналах. Клики и кандидаты считаются автоматически.
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Форма добавления канала */}
          {showAddForm && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-medium text-foreground">Новый канал</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Название</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Наш канал DevOps"
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">@username или ссылка</Label>
                  <Input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="@devjobsru"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setShowAddForm(false); setNewName(""); setNewUsername("") }}
                >
                  Отмена
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAddChannel}
                  disabled={savingChannels}
                >
                  {savingChannels ? <Loader2 className="w-3 h-3 animate-spin" /> : "Добавить"}
                </Button>
              </div>
            </div>
          )}

          {/* Список каналов */}
          {loadingChannels ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Нет каналов. Добавьте Telegram-канал компании, чтобы генерировать посты.
            </div>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                >
                  {/* Иконка Telegram */}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold" style={{ backgroundColor: "#0088cc" }}>
                    TG
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{channel.name}</p>
                    <a
                      href={channelHref(channel.username)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      {channel.username}
                      <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                    </a>
                  </div>

                  {/* Кнопка генерации */}
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5 shrink-0"
                    onClick={() => handleGeneratePost(channel)}
                    disabled={generating && selectedChannelId === channel.id}
                  >
                    {generating && selectedChannelId === channel.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Сгенерировать пост
                  </Button>

                  {/* Удалить */}
                  <button
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    onClick={() => setDeleteChannelId(channel.id)}
                    title="Удалить канал"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Превью поста */}
          {(generatedPost || (generating && selectedChannelId)) && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">
                    Пост для «{postChannelName}»
                  </p>
                  {usedAi && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </Badge>
                  )}
                  {!usedAi && generatedPost && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      Шаблон
                    </Badge>
                  )}
                </div>
                {generatedPost && (
                  <Button
                    size="sm"
                    variant={copied ? "default" : "outline"}
                    className="h-7 text-xs gap-1.5 shrink-0"
                    onClick={handleCopyPost}
                  >
                    {copied ? (
                      <><Check className="w-3 h-3" /> Скопировано</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Скопировать пост</>
                    )}
                  </Button>
                )}
              </div>

              {generating && !generatedPost ? (
                <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Генерирую пост…
                </div>
              ) : (
                <>
                  <Textarea
                    value={generatedPost}
                    onChange={(e) => setGeneratedPost(e.target.value)}
                    className="text-xs font-mono min-h-[200px] bg-card resize-y"
                    placeholder="Текст поста появится здесь…"
                  />
                  {shortUrl && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Трекинговая ссылка:</span>
                      <a
                        href={shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-mono"
                      >
                        {shortUrl.replace(/^https?:\/\/[^/]+/, "")}
                      </a>
                      <span className="text-[10px]">(клики и кандидаты считаются в «Источниках»)</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={!!deleteChannelId} onOpenChange={(open) => { if (!open) setDeleteChannelId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить канал?</AlertDialogTitle>
            <AlertDialogDescription>
              Канал будет удалён из списка компании. Уже созданные ссылки и статистика останутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
