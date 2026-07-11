"use client"

// Распознавание речи — Yandex SpeechKit (152-ФЗ, эндпоинт в РФ, основной
// канал) + опциональный зарубежный Whisper-фолбэк (settings.stt.*, см.
// lib/ai-rop/settings.ts::toSttConfig, lib/ai-rop/transcribe-yandex.ts).
// API-ключ — write-only секрет: с сервера сюда НИКОГДА не приходит полное
// значение, только флаг «настроен» + хвост 4 символа (см.
// app/api/modules/ai-rop/settings/route.ts::maskSttKey). Пустое поле при
// сохранении = не менять ключ; отдельная кнопка «Убрать ключ» — явная очистка.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mic, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

export interface SttInitial {
  configured: boolean
  keyTail: string | null
  folderId: string
  allowForeignFallback: boolean
}

async function postStt(patch: Record<string, unknown>) {
  const r = await fetch("/api/modules/ai-rop/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stt: patch }),
  })
  return r.json().catch(() => ({}))
}

export function SttCard({ initial }: { initial: SttInitial }) {
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [folderId, setFolderId] = useState(initial.folderId)
  const [allowForeignFallback, setAllowForeignFallback] = useState(initial.allowForeignFallback)
  const [configured, setConfigured] = useState(initial.configured)
  const [keyTail, setKeyTail] = useState(initial.keyTail)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const patch: Record<string, unknown> = { yandexFolderId: folderId.trim() || null, allowForeignSttFallback: allowForeignFallback }
      if (apiKeyInput.trim()) patch.yandexApiKey = apiKeyInput.trim()
      const data = await postStt(patch)
      if (data.ok !== false) {
        if (apiKeyInput.trim()) {
          setConfigured(true)
          setKeyTail(apiKeyInput.trim().length <= 4 ? apiKeyInput.trim() : apiKeyInput.trim().slice(-4))
          setApiKeyInput("")
        }
        setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500)
      }
    } finally { setBusy(false) }
  }

  async function clearKey() {
    if (!confirm("Удалить сохранённый ключ Yandex SpeechKit? Разбор новых звонков остановится, пока не будет введён новый ключ (если не разрешён Whisper-фолбэк).")) return
    setBusy(true)
    try {
      const data = await postStt({ yandexApiKey: null })
      if (data.ok !== false) { setConfigured(false); setKeyTail(null); router.refresh() }
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Mic className="size-4 text-violet-600" /> Распознавание речи</CardTitle>
        <CardDescription>Yandex SpeechKit — основной канал транскрипции звонков (152-ФЗ: эндпоинт в РФ).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge variant="outline" className={configured ? "w-fit gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "w-fit gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"}>
          {configured ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
          {configured ? `Настроен · …${keyTail}` : "Не настроен"}
        </Badge>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">API-ключ Yandex SpeechKit</Label>
          <Input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={configured ? "оставьте пустым, чтобы не менять" : "введите ключ"}
            className="font-mono text-xs"
            autoComplete="off"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Folder ID</Label>
          <Input value={folderId} onChange={(e) => setFolderId(e.target.value)} className="font-mono text-xs" placeholder="b1gxxxxxxxxxxxxxxxxx" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
          <div>
            <div className="text-sm font-medium">Разрешить зарубежный Whisper-фолбэк</div>
            <div className="text-xs text-muted-foreground">Если Yandex недоступен — временно транскрибировать через зарубежный OpenAI Whisper. Это трансграничная передача ПДн (152-ФЗ) — по умолчанию выключено.</div>
          </div>
          <Switch checked={allowForeignFallback} onCheckedChange={setAllowForeignFallback} disabled={busy} />
        </div>
        <div className="flex items-center justify-end gap-2">
          {configured && (
            <Button size="sm" variant="ghost" onClick={clearKey} disabled={busy} className="mr-auto text-destructive hover:text-destructive">
              Убрать ключ
            </Button>
          )}
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
