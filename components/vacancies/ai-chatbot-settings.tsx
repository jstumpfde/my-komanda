"use client"

// #15 Фаза 1: scaffolding для AI-чат-бота. Всё disabled.
// Реальные сохранения и логика — в Фазах 2-6.

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Bot, Wand2, Eye, Shield, Send } from "lucide-react"

const TRIGGERS = [
  { id: "salary",        label: "Вопросы о зарплате",                        defaultOn: true  },
  { id: "schedule",      label: "Вопросы о графике работы",                  defaultOn: true  },
  { id: "location",      label: "Вопросы о локации (офис / гибрид / удалёнка)", defaultOn: true  },
  { id: "experience",    label: "Вопросы о требованиях к опыту",             defaultOn: true  },
  { id: "callRedirect",  label: "Просьбы о звонке (перенаправление на демо)", defaultOn: true  },
  { id: "demoCheckin",   label: "Вопросы «удалось посмотреть демо?»",        defaultOn: true  },
  { id: "interviewSlot", label: "Согласование времени интервью (осторожно)", defaultOn: false },
]

export function AiChatbotSettings({ vacancyId: _vacancyId }: { vacancyId: string }) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header card — главный тумблер */}
      <Card className="opacity-95">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI чат-бот для общения с кандидатами
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1 bg-amber-50 text-amber-800 border-amber-200">
                  В разработке
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Пока недоступно — фича в разработке. Будет активирована в ближайшие дни.
              </CardDescription>
            </div>
            <Switch checked={false} disabled />
          </div>
        </CardHeader>
      </Card>

      {/* Когда AI отвечает */}
      <Card className="pointer-events-none opacity-60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Когда AI отвечает кандидату</CardTitle>
          <CardDescription>Триггеры, на которые бот реагирует автоматически.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {TRIGGERS.map(t => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={t.defaultOn} disabled className="rounded" />
              {t.label}
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Промпт */}
      <Card className="pointer-events-none opacity-60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Промпт для агента</CardTitle>
          <CardDescription>
            Промпт автоматически генерируется на основе:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>Профиля компании (из настроек компании)</li>
            <li>Анкеты вакансии (зарплата, требования, формат)</li>
            <li>Шаблонов ответов на типовые вопросы</li>
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
              <Wand2 className="w-3.5 h-3.5" /> Сгенерировать промпт
            </Button>
            <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
              <Eye className="w-3.5 h-3.5" /> Просмотр промпта
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Безопасность */}
      <Card className="pointer-events-none opacity-60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" /> Безопасность
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Порог уверенности AI</Label>
              <span className="text-xs text-muted-foreground tabular-nums">0.7</span>
            </div>
            <Slider value={[70]} min={0} max={100} step={5} disabled />
            <p className="text-[11px] text-muted-foreground">
              Если AI не уверен ниже порога — пишет в Telegram HR.
            </p>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Лимит сообщений в день на одного кандидата</Label>
            <Input type="number" defaultValue={5} disabled className="h-8 text-sm bg-[var(--input-bg)] w-32" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Стоп-слова перебивают AI</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Если в ответе кандидата встречается стоп-слово — AI не отвечает, эскалация HR'у.
              </p>
            </div>
            <Switch checked disabled />
          </div>
        </CardContent>
      </Card>

      {/* Telegram канал */}
      <Card className="pointer-events-none opacity-60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Send className="w-4 h-4" /> Telegram-канал HR для AI-эскалаций
          </CardTitle>
          <CardDescription>Куда AI пишет, если не уверен в ответе или нужно вмешательство.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Канал</Label>
            <Input
              defaultValue="@company_hr_alerts"
              disabled
              className="h-8 text-sm bg-[var(--input-bg)]"
            />
          </div>
          <Button size="sm" variant="outline" disabled className="gap-1.5 h-8 text-xs">
            Подключить Telegram
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
