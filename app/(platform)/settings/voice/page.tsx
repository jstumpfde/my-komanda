"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Volume2, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/auth"

const VOICES = [
  { id: "alena",  label: "Алёна",   desc: "Тёплый женский голос" },
  { id: "oksana", label: "Оксана",  desc: "Мягкий женский голос" },
  { id: "jane",   label: "Джейн",   desc: "Нейтральный женский голос" },
  { id: "filipp", label: "Филипп",  desc: "Мужской голос" },
  { id: "ermil",  label: "Эрмил",   desc: "Спокойный мужской голос" },
  { id: "zahar",  label: "Захар",   desc: "Насыщенный мужской голос" },
]

const EMOTIONS = [
  { id: "good",    label: "Тёплая"     },
  { id: "neutral", label: "Нейтральная" },
  { id: "evil",    label: "Строгая"    },
]

const SPEEDS = [
  { id: 0.8,  label: "Медленно" },
  { id: 1.0,  label: "Нормально" },
  { id: 1.1,  label: "Чуть быстрее" },
  { id: 1.5,  label: "Быстро" },
]

// Роли компании, которые могут использовать ассистента
const AVAILABLE_ROLES: { id: UserRole; label: string }[] = [
  { id: "director",        label: ROLE_LABELS.director },
  { id: "client",          label: ROLE_LABELS.client },
  { id: "hr_lead",         label: ROLE_LABELS.hr_lead },
  { id: "hr_manager",      label: ROLE_LABELS.hr_manager },
  { id: "department_head", label: ROLE_LABELS.department_head },
  { id: "observer",        label: ROLE_LABELS.observer },
  { id: "tester_hr",       label: ROLE_LABELS.tester_hr },
  { id: "employee",        label: ROLE_LABELS.employee },
]

// Модули платформы
const AVAILABLE_MODULES: { id: string; label: string }[] = [
  { id: "knowledge",  label: "База знаний" },
  { id: "learning",   label: "Обучение" },
  { id: "hr",         label: "HR" },
  { id: "onboarding", label: "Адаптация" },
  { id: "sales",      label: "Продажи" },
  { id: "tasks",      label: "Задачи" },
  { id: "marketing",  label: "Маркетинг" },
  { id: "logistics",  label: "Логистика" },
  { id: "platform",   label: "Платформа" },
]

export default function VoiceSettingsPage() {
  // ── Голос ──
  const [voice,      setVoice]      = useState("alena")
  const [emotion,    setEmotion]    = useState("good")
  const [speed,      setSpeed]      = useState(1.1)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [testing,    setTesting]    = useState(false)

  // ── Ассистент ──
  const [enabled,            setEnabled]            = useState(true)
  const [name,               setName]               = useState("")
  const [greeting,           setGreeting]           = useState("")
  const [visibleToRoles,     setVisibleToRoles]     = useState<string[]>([])
  const [modules,            setModules]            = useState<string[]>([])
  const [customInstructions, setCustomInstructions] = useState("")

  // ── UI ──
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    fetch("/api/settings/voice")
      .then(r => r.json())
      .then(d => {
        // Голос
        if (d.voice)                     setVoice(d.voice)
        if (d.emotion)                   setEmotion(d.emotion)
        if (d.speed)                     setSpeed(d.speed)
        if (d.ttsEnabled !== undefined)  setTtsEnabled(d.ttsEnabled)
        // Ассистент
        if (d.enabled !== undefined)     setEnabled(d.enabled)
        if (d.name)                      setName(d.name)
        if (d.greeting)                  setGreeting(d.greeting)
        if (Array.isArray(d.visibleToRoles)) setVisibleToRoles(d.visibleToRoles)
        if (Array.isArray(d.modules))    setModules(d.modules)
        if (d.customInstructions)        setCustomInstructions(d.customInstructions)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Голос
        voice, emotion, speed, ttsEnabled,
        // Ассистент
        enabled, name, greeting, visibleToRoles, modules, customInstructions,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testVoice = async () => {
    setTesting(true)
    const voiceName = VOICES.find(v => v.id === voice)?.label ?? voice
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Привет! Меня зовут ${name.trim() || voiceName}. Рада помочь!`,
        voice, emotion, speed,
      }),
    })
    if (resp.ok) {
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => { URL.revokeObjectURL(url); setTesting(false) }
      audio.onerror = () => { setTesting(false) }
      audio.play()
    } else {
      setTesting(false)
    }
  }

  const toggleRole = (id: string) => {
    setVisibleToRoles(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  const toggleModule = (id: string) => {
    setModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
    </div>
  )

  return (
    <div className="max-w-2xl space-y-10">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-violet-600" />
        <h1 className="text-xl font-bold">AI-ассистент</h1>
      </div>

      {/* ══════════════ БЛОК: АССИСТЕНТ ══════════════ */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 border-b pb-2">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ассистент</span>
        </div>

        {/* Вкл/выкл глобально */}
        <div className="flex items-center justify-between rounded-xl border p-4">
          <div>
            <div className="font-medium text-sm">Ассистент включён</div>
            <div className="text-xs text-muted-foreground mt-0.5">Показывать AI-ассистента сотрудникам компании</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Имя */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Имя ассистента</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Нэнси"
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">Оставьте пустым, чтобы использовать имя по умолчанию — «Нэнси»</p>
        </div>

        {/* Приветствие */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Приветствие</Label>
          <Textarea
            value={greeting}
            onChange={e => setGreeting(e.target.value)}
            placeholder="Оставьте пустым — ассистент использует стандартные приветствия для каждого раздела"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">Если задано — используется вместо стандартного приветствия во всех разделах</p>
        </div>

        {/* Доступные роли */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">Кто видит ассистента</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {visibleToRoles.length === 0
                ? "Все роли (по умолчанию)"
                : `Выбрано: ${visibleToRoles.length} из ${AVAILABLE_ROLES.length}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_ROLES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-all",
                  visibleToRoles.includes(r.id)
                    ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                    : "hover:border-muted-foreground/40"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {visibleToRoles.length > 0 && (
            <button
              type="button"
              onClick={() => setVisibleToRoles([])}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Сбросить — показывать всем
            </button>
          )}
        </div>

        {/* Модули */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">Разделы платформы</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modules.length === 0
                ? "Все разделы (по умолчанию)"
                : `Выбрано: ${modules.length} из ${AVAILABLE_MODULES.length}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_MODULES.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleModule(m.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-all",
                  modules.includes(m.id)
                    ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                    : "hover:border-muted-foreground/40"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {modules.length > 0 && (
            <button
              type="button"
              onClick={() => setModules([])}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Сбросить — показывать везде
            </button>
          )}
        </div>

        {/* Доп. инструкции */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Дополнительные инструкции</Label>
          <Textarea
            value={customInstructions}
            onChange={e => setCustomInstructions(e.target.value)}
            placeholder="Например: отвечай только на вопросы о найме, не обсуждай конкурентов, используй формальный тон..."
            rows={4}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">Добавляются к системному промпту — уточняют поведение ассистента для вашей компании</p>
        </div>
      </section>

      {/* ══════════════ БЛОК: ГОЛОС ══════════════ */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 border-b pb-2">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Голос</span>
        </div>

        {/* Вкл/выкл TTS */}
        <div className="flex items-center justify-between rounded-xl border p-4">
          <div>
            <div className="font-medium text-sm">Голосовые ответы</div>
            <div className="text-xs text-muted-foreground mt-0.5">Ассистент будет озвучивать свои ответы</div>
          </div>
          <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
        </div>

        {ttsEnabled && (
          <>
            {/* Выбор голоса */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Голос</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOICES.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoice(v.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      voice === v.id
                        ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    <div className="font-medium text-sm">{v.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Эмоция */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Интонация</Label>
              <div className="flex gap-2 flex-wrap">
                {EMOTIONS.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmotion(e.id)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm transition-all",
                      emotion === e.id
                        ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Скорость */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Скорость речи</Label>
              <div className="flex gap-2 flex-wrap">
                {SPEEDS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSpeed(s.id)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm transition-all",
                      speed === s.id
                        ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Тест */}
            <Button variant="outline" onClick={testVoice} disabled={testing} className="gap-2">
              {testing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Воспроизвожу...</>
                : <><Volume2 className="h-4 w-4" /> Прослушать</>
              }
            </Button>
          </>
        )}
      </section>

      <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-2">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Сохраняю...</> : saved ? "Сохранено ✓" : "Сохранить"}
      </Button>
    </div>
  )
}
