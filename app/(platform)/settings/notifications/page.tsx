"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Bell, MessageCircle, Mail, Smartphone, Save, CheckCircle2 } from "lucide-react"

const EVENT_SETTINGS = [
  { id: "new_candidate", label: "Новый кандидат в воронке", default: true },
  { id: "candidate_replied", label: "Кандидат ответил на сообщение", default: true },
  { id: "demo_completed", label: "Кандидат завершил демонстрацию", default: true },
  { id: "slot_selected", label: "Кандидат выбрал слот интервью", default: true },
  { id: "no_show", label: "Кандидат не пришёл на интервью", default: true },
  { id: "stage_passed", label: "Кандидат прошёл этап воронки", default: false },
  { id: "hr_decision_waiting", label: "Новый кандидат ожидает решения HR", default: true },
]

export default function NotificationsSettingsPage() {
  const [tgEnabled, setTgEnabled] = useState(true)
  const [tgUsername, setTgUsername] = useState("@anna_hr")
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [events, setEvents] = useState<Record<string, boolean>>(
    Object.fromEntries(EVENT_SETTINGS.map(e => [e.id, e.default]))
  )

  const toggleEvent = (id: string) => {
    setEvents(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
        <>
<div className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Уведомления</h1>
              <p className="text-muted-foreground text-sm">Каналы и события для уведомлений HR</p>
            </div>

            <div className="space-y-6">
              {/* Каналы */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Каналы уведомлений</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MessageCircle className="w-5 h-5 text-blue-500" />
                      <div>
                        <Label className="text-sm font-medium">Telegram</Label>
                        <p className="text-xs text-muted-foreground">Мгновенные уведомления в Telegram</p>
                      </div>
                    </div>
                    <Switch checked={tgEnabled} onCheckedChange={setTgEnabled} />
                  </div>
                  {tgEnabled && (
                    <div className="pl-8">
                      <Input value={tgUsername} onChange={e => setTgUsername(e.target.value)} placeholder="@username" className="h-9 w-48" />
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-amber-500" />
                      <div>
                        <Label className="text-sm font-medium">Email</Label>
                        <p className="text-xs text-muted-foreground">Дайджест на почту</p>
                      </div>
                    </div>
                    <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-purple-500" />
                      <div>
                        <Label className="text-sm font-medium">Push в браузере</Label>
                        <p className="text-xs text-muted-foreground">Браузерные push-уведомления</p>
                      </div>
                    </div>
                    <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
                  </div>
                </CardContent>
              </Card>

              {/* События */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> События для уведомлений</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {EVENT_SETTINGS.map(evt => (
                    <div key={evt.id} className="flex items-center justify-between py-1">
                      <Label className="text-sm">{evt.label}</Label>
                      <Switch checked={events[evt.id]} onCheckedChange={() => toggleEvent(evt.id)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button className="gap-1.5" onClick={() => toast.success("Настройки уведомлений сохранены")}><Save className="w-4 h-4" /> Сохранить</Button>
              </div>
            </div>
    </>
  )
}
