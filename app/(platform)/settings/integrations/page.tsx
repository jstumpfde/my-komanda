"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Link2, CheckCircle2, XCircle, Loader2, Lock, ExternalLink,
  RefreshCw, Save, ArrowRight, Info,
} from "lucide-react"

interface HhStatus {
  connected: boolean
  employerId?: string
  tokenExpiresAt?: string
}

interface CrmConnection {
  name: string
  connected: boolean
  portal?: string
  connectedAt?: Date
}

const HIREFLOW_STAGES = ["Новый", "Ожидает ответа", "Демонстрация", "Решение HR", "Интервью", "Финальное решение", "Нанят", "Отказ"]
const CRM_STATUSES = ["Новый лид", "В работе", "Квалифицирован", "Переговоры", "Решение", "Успешно реализовано", "Закрыто и не реализовано"]

export default function IntegrationsPage() {
  const [bitrix, setBitrix] = useState<CrmConnection>({ name: "Bitrix24", connected: false })
  const [amo, setAmo] = useState<CrmConnection>({ name: "AmoCRM", connected: false })
  const [connectDialog, setConnectDialog] = useState<string | null>(null)
  const [portalUrl, setPortalUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [connecting, setConnecting] = useState(false)

  // hh.ru integration state
  const [hhStatus, setHhStatus] = useState<HhStatus | null>(null)
  const [hhLoading, setHhLoading] = useState(true)
  const [hhDisconnecting, setHhDisconnecting] = useState(false)

  useEffect(() => {
    fetch("/api/integrations/hh/status")
      .then((r) => r.json())
      .then((data) => setHhStatus(data))
      .catch(() => setHhStatus({ connected: false }))
      .finally(() => setHhLoading(false))
  }, [])

  const handleHhDisconnect = async () => {
    setHhDisconnecting(true)
    try {
      const res = await fetch("/api/integrations/hh/disconnect", { method: "POST" })
      if (res.ok) {
        setHhStatus({ connected: false })
        toast.success("hh.ru отключён")
      } else {
        toast.error("Ошибка при отключении")
      }
    } catch {
      toast.error("Ошибка при отключении")
    } finally {
      setHhDisconnecting(false)
    }
  }

  // Sync settings
  const [syncNewCandidate, setSyncNewCandidate] = useState(true)
  const [syncStageChange, setSyncStageChange] = useState(true)
  const [syncHired, setSyncHired] = useState(true)
  const [syncReject, setSyncReject] = useState(true)
  const [syncResume, setSyncResume] = useState(false)
  const [syncDirection, setSyncDirection] = useState<"one-way" | "two-way">("one-way")

  // Mapping
  const [statusMap, setStatusMap] = useState<Record<string, string>>({
    "Новый": "Новый лид",
    "Ожидает ответа": "Новый лид",
    "Демонстрация": "В работе",
    "Решение HR": "Квалифицирован",
    "Интервью": "Переговоры",
    "Финальное решение": "Решение",
    "Нанят": "Успешно реализовано",
    "Отказ": "Закрыто и не реализовано",
  })

  const isAnyCrmConnected = bitrix.connected || amo.connected

  const handleConnectBitrix = async () => {
    if (!portalUrl) { toast.error("Введите URL портала"); return }
    setConnecting(true)
    await new Promise(r => setTimeout(r, 1500))
    setBitrix({ name: "Bitrix24", connected: true, portal: portalUrl, connectedAt: new Date() })
    setConnecting(false)
    setConnectDialog(null)
    setPortalUrl("")
    setApiKey("")
    toast.success("Bitrix24 подключён")
  }

  const handleConnectAmo = async () => {
    setConnecting(true)
    await new Promise(r => setTimeout(r, 1500))
    setAmo({ name: "AmoCRM", connected: true, portal: "romashka.amocrm.ru", connectedAt: new Date() })
    setConnecting(false)
    setConnectDialog(null)
    toast.success("AmoCRM подключён")
  }

  return (
        <>
<div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Интеграции</h1>
              <p className="text-muted-foreground text-sm">Подключение внешних сервисов и синхронизация данных</p>
            </div>

            <div className="space-y-6">

              {/* hh.ru */}
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">Джоб-борды</h2>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm shrink-0">hh</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">HeadHunter (hh.ru)</p>
                        <p className="text-xs text-muted-foreground">Публикация вакансий и импорт откликов</p>
                      </div>
                      {hhLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Badge variant="outline" className={cn("text-xs", hhStatus?.connected ? "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800" : "")}>
                          {hhStatus?.connected ? <><CheckCircle2 className="w-3 h-3 mr-1" />Подключено</> : "Не подключено"}
                        </Badge>
                      )}
                    </div>
                    {hhStatus?.connected ? (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {hhStatus.employerId && <p>ID работодателя: <span className="font-mono">{hhStatus.employerId}</span></p>}
                          {hhStatus.tokenExpiresAt && (
                            <p>Токен действует до: {new Date(hhStatus.tokenExpiresAt).toLocaleDateString("ru-RU")}</p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive hover:text-destructive"
                          onClick={handleHhDisconnect}
                          disabled={hhDisconnecting}
                        >
                          {hhDisconnecting ? <><Loader2 className="w-3 h-3 animate-spin mr-2" />Отключение...</> : "Отключить"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Подключите hh.ru для публикации вакансий и автоматического импорта откликов от кандидатов.
                        </p>
                        <Button className="w-full gap-1.5 bg-red-500 hover:bg-red-600 text-white" asChild>
                          <a href="/api/integrations/hh/auth">
                            <ExternalLink className="w-4 h-4" /> Подключить hh.ru
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* CRM Cards */}
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">Интеграции с CRM</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bitrix24 */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">B24</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">Bitrix24</p>
                        <p className="text-xs text-muted-foreground">CRM + задачи + чат</p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", bitrix.connected ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "")}>
                        {bitrix.connected ? <><CheckCircle2 className="w-3 h-3 mr-1" />Подключено</> : "Не подключено"}
                      </Badge>
                    </div>
                    {bitrix.connected ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{bitrix.portal}</p>
                        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => { setBitrix({ name: "Bitrix24", connected: false }); toast("Bitrix24 отключён") }}>
                          Отключить
                        </Button>
                      </div>
                    ) : (
                      <Button className="w-full gap-1.5" onClick={() => setConnectDialog("bitrix")}>
                        <Link2 className="w-4 h-4" /> Подключить
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* AmoCRM */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0">amo</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">AmoCRM</p>
                        <p className="text-xs text-muted-foreground">Воронка продаж</p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", amo.connected ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "")}>
                        {amo.connected ? <><CheckCircle2 className="w-3 h-3 mr-1" />Подключено</> : "Не подключено"}
                      </Badge>
                    </div>
                    {amo.connected ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{amo.portal}</p>
                        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => { setAmo({ name: "AmoCRM", connected: false }); toast("AmoCRM отключён") }}>
                          Отключить
                        </Button>
                      </div>
                    ) : (
                      <Button className="w-full gap-1.5" onClick={() => setConnectDialog("amo")}>
                        <Link2 className="w-4 h-4" /> Подключить
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Planned */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {["Salesforce", "HubSpot", "МойСклад", "1С CRM"].map(name => (
                  <div key={name} className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border opacity-50">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>

              {/* Sync Settings (only if connected) */}
              {isAnyCrmConnected && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Настройки синхронизации</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Что синхронизировать</Label>
                        {[
                          { label: "Новый кандидат → создать Лид в CRM", state: syncNewCandidate, set: setSyncNewCandidate },
                          { label: "Смена этапа воронки → обновить статус Лида", state: syncStageChange, set: setSyncStageChange },
                          { label: "Кандидат нанят → создать Контакт/Сделку", state: syncHired, set: setSyncHired },
                          { label: "Отказ → закрыть Лид с причиной", state: syncReject, set: setSyncReject },
                          { label: "Данные резюме → поля карточки", state: syncResume, set: setSyncResume },
                        ].map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <Label className="text-sm">{item.label}</Label>
                            <Switch checked={item.state} onCheckedChange={item.set} />
                          </div>
                        ))}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Направление</Label>
                        {[
                          { value: "one-way" as const, label: "Только Company24 → CRM", desc: "Рекомендуется" },
                          { value: "two-way" as const, label: "Двусторонняя синхронизация", desc: "Изменения в CRM отражаются в Company24" },
                        ].map(opt => (
                          <button key={opt.value} className={cn("w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all", syncDirection === opt.value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30")} onClick={() => setSyncDirection(opt.value)}>
                            <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center", syncDirection === opt.value ? "border-primary" : "border-muted-foreground/40")}>
                              {syncDirection === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <div><p className="text-sm font-medium">{opt.label}</p><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status mapping */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2"><ArrowRight className="w-4 h-4" /> Маппинг статусов</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground mb-2">Соответствие этапов Company24 → статусы CRM</p>
                      {HIREFLOW_STAGES.map(stage => (
                        <div key={stage} className="flex items-center gap-3">
                          <span className="text-sm text-foreground w-40 shrink-0">{stage}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <Select value={statusMap[stage] || ""} onValueChange={v => setStatusMap(prev => ({ ...prev, [stage]: v }))}>
                            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CRM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Info about B24 fields */}
                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                        <p className="font-semibold">В каждом лиде CRM отображаются поля:</p>
                        <p>Вакансия · Этап Company24 (с прогрессом демонстрации) · AI скоринг · Источник · Ссылка «Открыть в Company24»</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button className="gap-1.5" onClick={() => toast.success("Настройки интеграции сохранены")}><Save className="w-4 h-4" /> Сохранить</Button>
                  </div>
                </>
              )}
            </div>


      {/* Connect Bitrix Dialog */}
      <Dialog open={connectDialog === "bitrix"} onOpenChange={o => { if (!o) setConnectDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">B24</div>
            Подключение Bitrix24
          </DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">URL портала</Label>
              <Input value={portalUrl} onChange={e => setPortalUrl(e.target.value)} placeholder="portal.bitrix24.ru" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">API ключ (вебхук)</Label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="xxxxxxxxxxxx" type="password" />
            </div>
            <Button className="w-full" onClick={handleConnectBitrix} disabled={connecting}>
              {connecting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Подключение...</> : "Подключить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connect Amo Dialog */}
      <Dialog open={connectDialog === "amo"} onOpenChange={o => { if (!o) setConnectDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">amo</div>
            Подключение AmoCRM
          </DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Нажмите кнопку ниже для авторизации через AmoCRM</p>
            <Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white" onClick={handleConnectAmo} disabled={connecting}>
              {connecting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Подключение...</> : <><ExternalLink className="w-4 h-4 mr-2" />Авторизоваться в AmoCRM</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
