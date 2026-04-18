// app/(platform)/settings/demo-profile/page.tsx
// Страница настроек "Профиль для демонстраций должности".

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Loader2, Save, Sparkles, User, Building2, TrendingUp, Info, CheckCircle2, Upload, X,
} from "lucide-react"
import { toast } from "sonner"

interface DemoProfileData {
  ceoName?: string
  ceoShortBio?: string
  ceoExperience?: string
  ceoBackground?: string
  ceoAiAttitude?: string
  ceoStyle?: string
  ceoValues?: string
  ceoPhotoUrl?: string
  companyStage?: string
  companyMission?: string
  companyMarket?: string
  companyTeam?: string
  guarantee?: string
  incomeMedium?: string
}

export default function DemoProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<DemoProfileData>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/companies/demo-profile")
        if (!res.ok) throw new Error("Failed to load")
        const json = await res.json()
        if (cancelled) return
        const profile = (json?.data?.demoProfile ?? json?.demoProfile ?? {}) as DemoProfileData
        setData(profile)
      } catch {
        toast.error("Не удалось загрузить профиль")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const update = useCallback((key: keyof DemoProfileData, value: string) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/companies/demo-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Save failed")
      toast.success("Профиль для демонстраций сохранён")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [data])

  const handlePhotoUpload = useCallback(async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Формат: jpg, png, webp")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Максимум 5 МБ")
      return
    }
    setPhotoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/companies/demo-profile/photo", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ошибка" }))
        throw new Error(err.error || "Ошибка загрузки")
      }
      const json = await res.json()
      const url = json?.data?.ceoPhotoUrl ?? json?.ceoPhotoUrl
      if (url) {
        setData(prev => ({ ...prev, ceoPhotoUrl: url }))
        toast.success("Фото загружено")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось загрузить")
    } finally {
      setPhotoUploading(false)
    }
  }, [])

  const handlePhotoDelete = useCallback(async () => {
    setPhotoUploading(true)
    try {
      const res = await fetch("/api/companies/demo-profile/photo", { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      setData(prev => ({ ...prev, ceoPhotoUrl: "" }))
      toast.success("Фото удалено")
    } catch {
      toast.error("Не удалось удалить")
    } finally {
      setPhotoUploading(false)
    }
  }, [])

  const handleAiMaster = useCallback(async () => {
    if (aiText.trim().length < 20) {
      toast.error("Напишите минимум 2-3 предложения о себе и компании")
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch("/api/companies/demo-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ошибка" }))
        throw new Error(err.error || "AI не справился")
      }
      const json = await res.json()
      const suggested = (json?.data?.demoProfile ?? json?.demoProfile ?? {}) as DemoProfileData

      setData(prev => {
        const merged: DemoProfileData = { ...prev }
        for (const [k, v] of Object.entries(suggested)) {
          const key = k as keyof DemoProfileData
          if (!merged[key] && v) {
            merged[key] = v
          }
        }
        return merged
      })

      toast.success("AI заполнил поля. Проверьте и отредактируйте при необходимости")
      setAiOpen(false)
      setAiText("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI временно недоступен")
    } finally {
      setAiLoading(false)
    }
  }, [aiText])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка...
      </div>
    )
  }

  const filledCount = [
    data.ceoName, data.ceoShortBio, data.ceoExperience, data.ceoBackground,
    data.ceoAiAttitude, data.ceoStyle, data.ceoValues,
    data.companyStage, data.companyMission, data.companyMarket, data.companyTeam,
  ].filter(v => v && v.trim().length > 0).length
  const totalFields = 11
  const completeness = Math.round((filledCount / totalFields) * 100)

  return (
    <div className="max-w-4xl space-y-5 pb-12">
      {/* Скрытый input для загрузки */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handlePhotoUpload(f)
          e.target.value = ""
        }}
      />

      {/* Заголовок + статус */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Профиль для демонстраций</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Данные о вас как руководителе и о компании. AI использует их при генерации демонстрации вакансий — подставляет в блоки «О руководителе», «Приветствие», «Что дальше».
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-sm">
          Заполнено: {completeness}% ({filledCount}/{totalFields})
        </Badge>
      </div>

      {/* AI-мастер CTA */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-center gap-4 flex-wrap">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Быстрое заполнение с AI</p>
            <p className="text-xs text-muted-foreground">Опишите себя и компанию одним большим текстом — AI разложит на поля за 10 секунд</p>
          </div>
          <Button onClick={() => setAiOpen(true)} className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            Заполнить через AI
          </Button>
        </CardContent>
      </Card>

      {/* ─── БЛОК 1: О РУКОВОДИТЕЛЕ ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            О руководителе
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Эти данные AI подставит в блок «О руководителе» в демонстрации должности
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фото */}
          <div>
            <Label className="text-xs">Фото руководителя</Label>
            <div className="mt-2 flex items-center gap-4">
              {data.ceoPhotoUrl ? (
                <div className="relative">
                  <img
                    src={data.ceoPhotoUrl}
                    alt={data.ceoName || "Руководитель"}
                    className="w-72 h-72 rounded-xl object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={handlePhotoDelete}
                    disabled={photoUploading}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground hover:opacity-80 flex items-center justify-center"
                    title="Удалить"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-72 h-72 rounded-xl bg-muted flex items-center justify-center border border-dashed border-border">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  className="gap-1.5"
                >
                  {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {data.ceoPhotoUrl ? "Заменить" : "Загрузить фото"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1.5">JPG, PNG, WebP — до 5 МБ</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Имя и фамилия *</Label>
              <Input
                value={data.ceoName || ""}
                onChange={(e) => update("ceoName", e.target.value)}
                placeholder="Юрий Штумпф"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Опыт и регалии</Label>
              <Input
                value={data.ceoExperience || ""}
                onChange={(e) => update("ceoExperience", e.target.value)}
                placeholder="больше 30 лет"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Короткое позиционирование</Label>
            <Textarea
              value={data.ceoShortBio || ""}
              onChange={(e) => update("ceoShortBio", e.target.value)}
              placeholder="Предприниматель, архитектор бизнес-систем. Создатель MarketRadar и Company24.Pro..."
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">История и путь</Label>
            <Textarea
              value={data.ceoBackground || ""}
              onChange={(e) => update("ceoBackground", e.target.value)}
              placeholder="Строил маркетинг, продажи и команды в разных нишах. С 2012 создавал сложные веб-системы..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Взгляды и принципы</Label>
            <Textarea
              value={data.ceoAiAttitude || ""}
              onChange={(e) => update("ceoAiAttitude", e.target.value)}
              placeholder="Всегда стремился к автоматизации. С появлением AI увидел, что большую часть операционки может делать искусственный интеллект..."
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Стиль управления</Label>
            <Textarea
              value={data.ceoStyle || ""}
              onChange={(e) => update("ceoStyle", e.target.value)}
              placeholder="Работаю в плотной связке в первые 2-3 месяца — задаю стратегию, обсуждаем приоритеты..."
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Ценности и команда</Label>
            <Input
              value={data.ceoValues || ""}
              onChange={(e) => update("ceoValues", e.target.value)}
              placeholder="глубину мышления, способность видеть суть, открытость новому"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── БЛОК 2: О КОМПАНИИ ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-primary" />
            О компании для демо
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Используется в блоках «О продукте», «Рынок и клиенты», «Почему сейчас»
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Стадия компании</Label>
            <Input
              value={data.companyStage || ""}
              onChange={(e) => update("companyStage", e.target.value)}
              placeholder="стартап на стадии активного роста / средний бизнес / зрелая компания"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Миссия и продукт</Label>
            <Textarea
              value={data.companyMission || ""}
              onChange={(e) => update("companyMission", e.target.value)}
              placeholder="Company24.Pro — AI-операционная система для бизнеса..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Рынок, клиенты, цели роста</Label>
            <Textarea
              value={data.companyMarket || ""}
              onChange={(e) => update("companyMarket", e.target.value)}
              placeholder="Подписка 180 000–990 000 ₽/год. Рынок — сотни тысяч компаний в РФ и СНГ..."
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          <div>
            <Label className="text-xs">Состав команды сейчас</Label>
            <Textarea
              value={data.companyTeam || ""}
              onChange={(e) => update("companyTeam", e.target.value)}
              placeholder="CEO, технический сотрудник, несколько подрядчиков..."
              rows={2}
              className="mt-1 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── БЛОК 3: ТИПОВЫЕ ЦИФРЫ ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4 text-primary" />
            Типовые цифры для блока «Деньги»
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Общие формулировки — для конкретной вакансии цифры берутся из анкеты
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Гарантированный минимум на старте</Label>
              <Input
                value={data.guarantee || ""}
                onChange={(e) => update("guarantee", e.target.value)}
                placeholder="80 000"
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Только число, без ₽</p>
            </div>
            <div>
              <Label className="text-xs">Средний ожидаемый доход</Label>
              <Input
                value={data.incomeMedium || ""}
                onChange={(e) => update("incomeMedium", e.target.value)}
                placeholder="100 000–130 000"
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">В виде «100 000–130 000»</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Кнопка сохранения */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border py-3 -mx-14 px-14 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          Изменения применятся при следующей генерации демо
        </p>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 min-w-[140px]">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Сохраняю..." : "Сохранить"}
        </Button>
      </div>

      {/* AI-Мастер */}
      <Dialog open={aiOpen} onOpenChange={(o) => { if (!aiLoading) setAiOpen(o) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI-мастер заполнения
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Опишите одним текстом: кто вы, чем занимаетесь, что за компания, на какой она стадии, какой продукт, какие клиенты, какие цели. Чем подробнее — тем лучше AI разложит на поля.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Пример:</p>
              <p>
                Меня зовут Юрий Штумпф. Предприниматель, архитектор бизнес-систем. 30+ лет в бизнесе, строил маркетинг и команды в разных нишах. С 2012 создаю веб-системы. Company24.Pro — AI-операционная система для бизнеса. Стадия — активный рост. Подписка 180-990К в год. Клиенты — стартапы, малый и средний бизнес. Цели: 1000 клиентов в 2026. Команда сейчас — я, технический сотрудник и подрядчики. Ценю глубину мышления и открытость новому. Стиль работы — глубоко и основательно.
              </p>
            </div>
            <Textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Начните печатать..."
              rows={9}
              className="resize-none text-sm"
              disabled={aiLoading}
            />
            <p className="text-[11px] text-muted-foreground">
              {aiText.length} символов. AI заполнит только пустые поля — существующие значения не перезапишутся.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiLoading}>
              Отмена
            </Button>
            <Button onClick={handleAiMaster} disabled={aiLoading} className="gap-1.5">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {aiLoading ? "AI думает..." : "Разобрать на поля"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
