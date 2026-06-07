"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"

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

export default function VoiceSettingsPage() {
  const [voice,      setVoice]      = useState("alena")
  const [emotion,    setEmotion]    = useState("good")
  const [speed,      setSpeed]      = useState(1.1)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    fetch("/api/settings/voice")
      .then(r => r.json())
      .then(d => {
        if (d.voice)      setVoice(d.voice)
        if (d.emotion)    setEmotion(d.emotion)
        if (d.speed)      setSpeed(d.speed)
        if (d.ttsEnabled !== undefined) setTtsEnabled(d.ttsEnabled)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice, emotion, speed, ttsEnabled }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testVoice = async () => {
    setTesting(true)
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Привет! Меня зовут ${VOICES.find(v => v.id === voice)?.label ?? voice}. Рада помочь!`, voice, emotion, speed }),
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

  if (loading) return (
    <div className="flex items-center gap-2 text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
    </div>
  )

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <Volume2 className="h-5 w-5 text-violet-600" />
        <h1 className="text-xl font-bold">Голос ассистентов</h1>
      </div>

      {/* Вкл/выкл */}
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="font-medium text-sm">Голосовые ответы</div>
          <div className="text-xs text-muted-foreground mt-0.5">Нэнси будет озвучивать свои ответы</div>
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

      <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-2">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Сохраняю...</> : saved ? "Сохранено ✓" : "Сохранить"}
      </Button>
    </div>
  )
}
