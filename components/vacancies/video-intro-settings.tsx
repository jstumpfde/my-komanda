"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { useVacancySectionRegister } from "./vacancy-settings-context"

// Группа 27: настройки блока «Видео-визитка» в конструкторе воронки.
// Конфиг хранится в vacancies.description_json.videoIntro через
// endpoint /api/modules/hr/vacancies/[id]/video-intro (GET/PUT).
//
// В Sheet конструктора нет своей кнопки «Сохранить» — она в подвале Sheet.
// Поэтому регистрируем save через useVacancySectionRegister(), как делают
// другие компоненты настроек (см. vacancy-requirements-settings.tsx).

export interface VideoIntroConfig {
  required:           boolean
  instruction:        string
  maxDurationSeconds: number
  minDurationSeconds: number
  thankYouText:       string
}

const DEFAULT_CONFIG: VideoIntroConfig = {
  required:           false,
  instruction:        "Расскажите о себе за 60 секунд. Кто вы, какой у вас опыт, почему вас заинтересовала эта вакансия.",
  maxDurationSeconds: 60,
  minDurationSeconds: 15,
  thankYouText:       "Спасибо! Ваше видео получено и будет передано HR.",
}

const MIN_OPTIONS = [10, 15, 20, 30] as const
const MAX_OPTIONS = [30, 60, 120, 180] as const

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} секунд`
  const minutes = seconds / 60
  return minutes === 1 ? "1 минута" : `${minutes} минут`
}

export function VideoIntroSettings({
  vacancyId,
  onSaved,
}: {
  vacancyId: string
  onSaved?:  () => void
}) {
  const [config, setConfig] = useState<VideoIntroConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/video-intro`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { config?: Partial<VideoIntroConfig> } | null) => {
        if (cancelled) return
        if (data?.config) setConfig({ ...DEFAULT_CONFIG, ...data.config })
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  const save = async () => {
    const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/video-intro`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(config),
    })
    if (!res.ok) {
      toast.error("Не удалось сохранить настройки видео-визитки")
      throw new Error("save video-intro failed")
    }
    toast.success("Настройки видео-визитки сохранены")
    onSaved?.()
  }

  useVacancySectionRegister({
    sectionKey:    `funnel-builder-video-intro:${vacancyId}`,
    tabKey:        "funnel-builder",
    loaded,
    watchedValues: config,
    save,
  })

  // Поднимаем минимум выше максимума? Корректируем максимум, чтобы не
  // получить запрет API: backend защищает через Math.max(min, max).
  const handleMinChange = (value: string) => {
    const min = Number(value)
    setConfig(prev => ({
      ...prev,
      minDurationSeconds: min,
      maxDurationSeconds: Math.max(prev.maxDurationSeconds, min),
    }))
  }

  const handleMaxChange = (value: string) => {
    const max = Number(value)
    setConfig(prev => ({
      ...prev,
      maxDurationSeconds: max,
      minDurationSeconds: Math.min(prev.minDurationSeconds, max),
    }))
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Видео-визитка повышает качество отбора, но снижает количество откликов.
          Включайте только если кандидаты должны продемонстрировать речевые навыки.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Инструкция для кандидата</Label>
        <Textarea
          value={config.instruction}
          onChange={(e) => setConfig({ ...config, instruction: e.target.value })}
          placeholder="Что должен снять кандидат..."
          rows={4}
          maxLength={1000}
          disabled={!loaded}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Минимальная длительность</Label>
          <Select
            value={String(config.minDurationSeconds)}
            onValueChange={handleMinChange}
            disabled={!loaded}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MIN_OPTIONS.map(s => (
                <SelectItem key={s} value={String(s)}>{formatDuration(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Максимальная длительность</Label>
          <Select
            value={String(config.maxDurationSeconds)}
            onValueChange={handleMaxChange}
            disabled={!loaded}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAX_OPTIONS.map(s => (
                <SelectItem key={s} value={String(s)}>{formatDuration(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Обязательный шаг</Label>
          <p className="text-xs text-muted-foreground">
            Если включено, кандидат не сможет пропустить запись видео
          </p>
        </div>
        <Switch
          checked={config.required}
          onCheckedChange={(v) => setConfig({ ...config, required: v })}
          disabled={!loaded}
        />
      </div>

      <div className="space-y-2">
        <Label>Текст после успешной загрузки</Label>
        <Input
          value={config.thankYouText}
          onChange={(e) => setConfig({ ...config, thankYouText: e.target.value })}
          placeholder="Спасибо! Ваше видео получено"
          maxLength={1000}
          disabled={!loaded}
        />
      </div>
    </div>
  )
}
