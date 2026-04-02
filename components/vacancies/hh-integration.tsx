"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Link2, Unlink, RefreshCw, CheckCircle2, XCircle, Clock, Users,
  Bell, Mail, MessageCircle, Smartphone, ExternalLink, Loader2, Info,
} from "lucide-react"
import type { Candidate } from "@/components/dashboard/candidate-card"

// ─── Типы ────────────────────────────────────────────────────

interface HhAccount {
  email: string
  employerName: string
  connectedAt: Date
}

interface HhSyncSettings {
  autoSync: boolean
  syncInterval: "5" | "15" | "30" | "60"
  notifyTelegram: boolean
  notifyEmail: boolean
  notifyPush: boolean
  autoMessageEnabled: boolean
  autoMessageDelay: number // минут
  autoMessageText: string
}

interface SyncResult {
  candidates: Candidate[]
  total: number
}

export interface HhMessageLog {
  candidateId: string
  candidateName: string
  message: string
  sentAt: Date
}

// ─── Тестовые отклики с hh.ru ───────────────────────────────

const HH_TEST_RESPONSES: Candidate[] = [
  {
    id: `hh-${Date.now()}-1`,
    name: "Алексей Козлов",
    city: "Москва",
    salaryMin: 120000,
    salaryMax: 160000,
    score: 72,
    progress: 10,
    source: "hh.ru",
    experience: "3 года в продажах B2B",
    skills: ["CRM", "Холодные звонки", "Презентации"],
    addedAt: new Date(),
    lastSeen: new Date(Date.now() - 1800000),
  },
  {
    id: `hh-${Date.now()}-2`,
    name: "Ольга Новикова",
    city: "Санкт-Петербург",
    salaryMin: 100000,
    salaryMax: 140000,
    score: 68,
    progress: 10,
    source: "hh.ru",
    experience: "2 года в ритейле",
    skills: ["Продажи", "Обслуживание", "Excel"],
    addedAt: new Date(),
    lastSeen: new Date(Date.now() - 3600000),
  },
  {
    id: `hh-${Date.now()}-3`,
    name: "Дмитрий Соколов",
    city: "Казань",
    salaryMin: 90000,
    salaryMax: 130000,
    score: 85,
    progress: 10,
    source: "hh.ru",
    experience: "5 лет в B2B продажах",
    skills: ["Переговоры", "Key Account", "SAP"],
    addedAt: new Date(),
    lastSeen: "online",
  },
  {
    id: `hh-${Date.now()}-4`,
    name: "Анна Фёдорова",
    city: "Новосибирск",
    salaryMin: 80000,
    salaryMax: 120000,
    score: 61,
    progress: 10,
    source: "hh.ru",
    experience: "1 год в телемаркетинге",
    skills: ["Телефонные продажи", "Скрипты"],
    addedAt: new Date(),
    lastSeen: new Date(Date.now() - 7200000),
  },
  {
    id: `hh-${Date.now()}-5`,
    name: "Сергей Морозов",
    city: "Екатеринбург",
    salaryMin: 110000,
    salaryMax: 150000,
    score: 78,
    progress: 10,
    source: "hh.ru",
    experience: "4 года, руководитель группы",
    skills: ["Управление командой", "B2B", "KPI"],
    addedAt: new Date(),
    lastSeen: "online",
  },
]

const DEFAULT_SYNC_SETTINGS: HhSyncSettings = {
  autoSync: false,
  syncInterval: "15",
  notifyTelegram: false,
  notifyEmail: true,
  notifyPush: true,
  autoMessageEnabled: true,
  autoMessageDelay: 5,
  autoMessageText: "Здравствуйте, {{имя}}! Спасибо за отклик на вакансию. Мы подготовили для вас короткую демонстрацию должности — займёт ~15 минут. Перейдите по ссылке, чтобы узнать о компании, роли и доходе.",
}

// ─── Компонент ──────────────────────────────────────────────

interface HhIntegrationProps {
  onCandidatesImported?: (candidates: Candidate[]) => void
  onMessageLog?: (log: HhMessageLog) => void
}

export function HhIntegration({ onCandidatesImported, onMessageLog }: HhIntegrationProps) {
  const [accounts, setAccounts] = useState<HhAccount[]>([])
  const [account, setAccount] = useState<HhAccount | null>(null) // legacy compat
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncSettings, setSyncSettings] = useState<HhSyncSettings>(DEFAULT_SYNC_SETTINGS)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncFoundCount, setSyncFoundCount] = useState(0)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [totalSynced, setTotalSynced] = useState(0)

  // Telegram accounts
  const [tgAccounts, setTgAccounts] = useState<{ id: string; name: string; addedAt: Date }[]>([])
  const [tgInput, setTgInput] = useState("")

  const isConnected = accounts.length > 0 || !!account

  // ── Подключение OAuth (заглушка) ─────────────────────────

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    await new Promise(r => setTimeout(r, 2000))
    const emails = ["hr@romashka.ru", "hr2@romashka.ru", "agency@mail.ru"]
    const newEmail = emails[accounts.length % emails.length]
    const newAcc: HhAccount = { email: newEmail, employerName: "ООО Ромашка", connectedAt: new Date() }
    setAccounts(prev => [...prev, newAcc])
    if (!account) setAccount(newAcc)
    setConnecting(false)
    setConnectDialogOpen(false)
    toast.success(`hh.ru аккаунт ${newEmail} подключён`)
  }, [accounts, account])

  const handleDisconnect = () => {
    setAccount(null)
    setAccounts([])
    setLastSyncAt(null)
    setTotalSynced(0)
    toast("hh.ru отключён")
  }

  const handleDisconnectOne = (email: string) => {
    setAccounts(prev => prev.filter(a => a.email !== email))
    if (account?.email === email) setAccount(accounts.find(a => a.email !== email) || null)
    toast(`Аккаунт ${email} отключён`)
  }

  const handleAddTg = () => {
    if (!tgInput.trim()) return
    setTgAccounts(prev => [...prev, { id: `tg-${Date.now()}`, name: tgInput.trim(), addedAt: new Date() }])
    setTgInput("")
    toast.success(`Telegram источник ${tgInput} добавлен`)
  }

  const handleRemoveTg = (id: string) => {
    setTgAccounts(prev => prev.filter(t => t.id !== id))
    toast("Telegram источник удалён")
  }

  // ── Синхронизация откликов ────────────────────────────────

  const handleSync = useCallback(async () => {
    if (!isConnected || syncing) return
    setSyncing(true)
    setSyncProgress(0)
    setSyncFoundCount(0)

    // Анимация прогресса
    for (let i = 0; i <= 100; i += 8) {
      await new Promise(r => setTimeout(r, 150))
      setSyncProgress(Math.min(i, 100))
      if (i >= 30) setSyncFoundCount(Math.min(Math.floor((i / 100) * HH_TEST_RESPONSES.length), HH_TEST_RESPONSES.length))
    }

    setSyncProgress(100)
    setSyncFoundCount(HH_TEST_RESPONSES.length)

    // Немного подождём после 100%
    await new Promise(r => setTimeout(r, 500))

    // Генерируем уникальные id для каждой синхронизации
    const candidates = HH_TEST_RESPONSES.map(c => ({
      ...c,
      id: `hh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      addedAt: new Date(),
    }))

    onCandidatesImported?.(candidates)
    setLastSyncAt(new Date())
    setTotalSynced(prev => prev + candidates.length)

    setSyncing(false)
    toast.success(`Синхронизировано ${candidates.length} откликов с hh.ru`)

    // Автоматические сообщения
    if (syncSettings.autoMessageEnabled) {
      const delay = syncSettings.autoMessageDelay
      setTimeout(() => {
        candidates.forEach(c => {
          const firstName = c.name.split(" ")[0]
          const text = syncSettings.autoMessageText.replace("{{имя}}", firstName)
          onMessageLog?.({
            candidateId: c.id,
            candidateName: c.name,
            message: text,
            sentAt: new Date(),
          })
        })
        toast.info(`Автосообщения отправлены ${candidates.length} кандидатам в hh-чат`, {
          description: `Задержка: ${delay} мин.`,
        })
      }, Math.min(delay * 1000, 5000)) // для демо ускоряем
    }
  }, [isConnected, syncing, onCandidatesImported, onMessageLog, syncSettings])

  const updateSettings = (patch: Partial<HhSyncSettings>) => {
    setSyncSettings(prev => ({ ...prev, ...patch }))
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="space-y-3">
      {/* ── Карточка hh.ru ─────────────────────────────────── */}
      <Card>
        {/* Compact header row */}
        <CardContent className="px-4 py-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white font-bold text-xs shrink-0">hh</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">hh.ru</p>
            <p className="text-[12px] text-muted-foreground">Импорт откликов и управление вакансиями</p>
          </div>
          <Badge variant="outline" className={cn("text-[12px] shrink-0", isConnected ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "text-muted-foreground border-border")}>
            {isConnected ? <><CheckCircle2 className="w-3 h-3 mr-1" />Подключено</> : "Не подключено"}
          </Badge>
          {!isConnected && (
            <Button size="sm" className="h-8 text-[12px] gap-1 bg-red-500 hover:bg-red-600 text-white shrink-0" onClick={() => setConnectDialogOpen(true)}>Подключить</Button>
          )}
        </CardContent>
        {/* Expanded content only when connected */}
        {isConnected && <CardContent className="px-4 pb-4 pt-0 space-y-4 border-t border-border mt-0">
          <>
              {/* Список аккаунтов hh.ru */}
              <div className="space-y-2">
                {accounts.map((acc, i) => (
                  <div key={acc.email} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{acc.email}</p>
                        {i === 0 && <Badge variant="outline" className="text-[10px] h-4">основной</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{acc.employerName} · подключено {acc.connectedAt.toLocaleDateString("ru-RU")}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs" onClick={() => handleDisconnectOne(acc.email)}>
                      <Unlink className="w-3 h-3 mr-1" /> Отключить
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={() => setConnectDialogOpen(true)}>
                  <Link2 className="w-3.5 h-3.5" /> Добавить аккаунт hh.ru
                </Button>
              </div>

              {/* Telegram аккаунты */}
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-500" />
                  <Label className="text-sm font-medium">Telegram источники</Label>
                </div>
                {tgAccounts.map(tg => (
                  <div key={tg.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-sm text-foreground">{tg.name}</span>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-6 text-xs" onClick={() => handleRemoveTg(tg.id)}>
                      <Unlink className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 h-8 rounded-md border border-border px-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                    value={tgInput}
                    onChange={e => setTgInput(e.target.value)}
                    placeholder="@channel или бот"
                    onKeyDown={e => { if (e.key === "Enter") handleAddTg() }}
                  />
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleAddTg}>
                    <Link2 className="w-3 h-3" /> Добавить
                  </Button>
                </div>
              </div>
              <Separator />

              {/* Синхронизация */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Синхронизация откликов</p>
                    {lastSyncAt && (
                      <p className="text-xs text-muted-foreground">
                        Последняя: {formatTime(lastSyncAt)} · Всего импортировано: {totalSynced}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Синхронизировать
                  </Button>
                </div>

                {syncing && (
                  <div className="space-y-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-700 dark:text-blue-400">
                        Загружаю отклики...
                      </span>
                      <span className="text-blue-700 dark:text-blue-400 font-medium">
                        найдено {syncFoundCount} новых
                      </span>
                    </div>
                    <Progress value={syncProgress} className="h-2" />
                  </div>
                )}
              </div>
            </>
        </CardContent>}
      </Card>

      {/* ── Настройки синхронизации (только если подключено) ── */}
      {isConnected && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Настройки синхронизации
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Автосинхронизация */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Автосинхронизация</Label>
                  <p className="text-xs text-muted-foreground">Автоматически загружать новые отклики</p>
                </div>
                <Switch
                  checked={syncSettings.autoSync}
                  onCheckedChange={(v) => updateSettings({ autoSync: v })}
                />
              </div>

              {syncSettings.autoSync && (
                <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                  <Label className="text-sm">Интервал</Label>
                  <Select
                    value={syncSettings.syncInterval}
                    onValueChange={(v) => updateSettings({ syncInterval: v as HhSyncSettings["syncInterval"] })}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Каждые 5 мин</SelectItem>
                      <SelectItem value="15">Каждые 15 мин</SelectItem>
                      <SelectItem value="30">Каждые 30 мин</SelectItem>
                      <SelectItem value="60">Каждые 60 мин</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Уведомления */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Уведомлять HR о новых откликах
                </Label>

                <div className="space-y-2.5 pl-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      <Label className="text-sm">Telegram</Label>
                    </div>
                    <Switch
                      checked={syncSettings.notifyTelegram}
                      onCheckedChange={(v) => updateSettings({ notifyTelegram: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <Label className="text-sm">Email</Label>
                    </div>
                    <Switch
                      checked={syncSettings.notifyEmail}
                      onCheckedChange={(v) => updateSettings({ notifyEmail: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                      <Label className="text-sm">Push-уведомления</Label>
                    </div>
                    <Switch
                      checked={syncSettings.notifyPush}
                      onCheckedChange={(v) => updateSettings({ notifyPush: v })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Автоматическое сообщение ──────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Автоматическое сообщение
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Отправлять приветственное сообщение</Label>
                  <p className="text-xs text-muted-foreground">Бот отправит сообщение в hh-чат после появления отклика</p>
                </div>
                <Switch
                  checked={syncSettings.autoMessageEnabled}
                  onCheckedChange={(v) => updateSettings({ autoMessageEnabled: v })}
                />
              </div>

              {syncSettings.autoMessageEnabled && (
                <>
                  <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                    <Label className="text-sm">Задержка отправки</Label>
                    <Select
                      value={String(syncSettings.autoMessageDelay)}
                      onValueChange={(v) => updateSettings({ autoMessageDelay: Number(v) })}
                    >
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 минута</SelectItem>
                        <SelectItem value="5">5 минут</SelectItem>
                        <SelectItem value="10">10 минут</SelectItem>
                        <SelectItem value="15">15 минут</SelectItem>
                        <SelectItem value="30">30 минут</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                    <Label className="text-sm">Текст сообщения</Label>
                    <textarea
                      className="w-full border rounded-lg p-3 text-sm resize-none h-28 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      value={syncSettings.autoMessageText}
                      onChange={(e) => updateSettings({ autoMessageText: e.target.value })}
                    />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Info className="w-3 h-3" />
                      <span>Используйте {"{{имя}}"} для подстановки имени кандидата</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Диалог подключения ────────────────────────────── */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white font-bold text-xs">hh</div>
              Подключение hh.ru
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Для подключения аккаунта hh.ru:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>Нажмите кнопку ниже — откроется страница авторизации hh.ru</li>
                <li>Войдите в аккаунт работодателя</li>
                <li>Разрешите доступ для Company24</li>
                <li>Вы будете перенаправлены обратно</li>
              </ol>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Company24 получит доступ к откликам и переписке по вакансиям. Вы сможете отключить интеграцию в любой момент.
                </p>
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-red-500 hover:bg-red-600 text-white h-12"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Подключение...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Открыть hh.ru для авторизации
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
