"use client"

// #21: редактор напоминаний (Сообщения 2 и 3 серии первых сообщений).
//
// Сообщение 1 (приглашение) и текст для нерабочего времени редактируются в табе
// «Портрет» (spec.inviteLetter / spec.offHoursLetter) — здесь НЕ показываются,
// но chain[0] и off-hours держим в состоянии и отправляем при сохранении без
// изменений (round-trip), чтобы не затереть. UI — только напоминания 2 и 3:
// тумблер, задержка (15с/30с/1м/3м/15м/30м/1ч), текстарея с шаблоном.
//
// Сохраняется через PUT /api/modules/hr/vacancies/[id]/first-messages-chain.
// При сохранении chain[0].text дублируется в ai_process_settings.inviteMessage
// (backward compat) — это делает endpoint на сервере.

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { Loader2, Save, Send } from "lucide-react"
import { toast } from "sonner"

export interface ChainStep {
  enabled:      boolean
  delaySeconds: number
  text:         string
}

interface Props {
  vacancyId: string
  initial?: ChainStep[]
  /** Fallback для msg1 если chain пустой (из ai_process_settings.inviteMessage). */
  fallbackFirstMessage?: string
  /** Fallback задержки для msg1 (из automation.delaySeconds). */
  fallbackFirstDelaySeconds?: number
  /** Off-hours: альтернативный текст Сообщения 1 для нерабочего времени. */
  initialOffHoursEnabled?: boolean
  initialOffHoursDelaySeconds?: number
  initialOffHoursText?: string | null
  onSaved?: (chain: ChainStep[]) => void
}

const DELAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15,   label: "15 секунд" },
  { value: 30,   label: "30 секунд" },
  { value: 60,   label: "1 минута" },
  { value: 180,  label: "3 минуты" },
  { value: 900,  label: "15 минут" },
  { value: 1800, label: "30 минут" },
  { value: 3600, label: "1 час" },
]

const PLACEHOLDER_TOKENS = ["name", "vacancy", "company", "demo_link"]

interface OffHoursState {
  enabled:      boolean
  delaySeconds: number
  text:         string
}

function emptyChain(fallbackText: string, fallbackDelay: number): ChainStep[] {
  return [
    { enabled: true,  delaySeconds: fallbackDelay, text: fallbackText },
    { enabled: false, delaySeconds: 60,           text: "" },
    { enabled: false, delaySeconds: 180,          text: "" },
  ]
}

export function FirstMessagesChainEditor({
  vacancyId,
  initial,
  fallbackFirstMessage = "",
  fallbackFirstDelaySeconds = 180,
  initialOffHoursEnabled = false,
  initialOffHoursDelaySeconds = 15,
  initialOffHoursText = "",
  onSaved,
}: Props) {
  const initialChain = (() => {
    if (Array.isArray(initial) && initial.length > 0) {
      // Дополняем до 3 шагов на всякий случай.
      const out = [...initial]
      while (out.length < 3) {
        out.push({ enabled: false, delaySeconds: out.length === 1 ? 60 : 180, text: "" })
      }
      return out.slice(0, 3)
    }
    return emptyChain(fallbackFirstMessage, fallbackFirstDelaySeconds)
  })()
  const initialOff: OffHoursState = {
    enabled:      initialOffHoursEnabled,
    delaySeconds: initialOffHoursDelaySeconds,
    text:         initialOffHoursText ?? "",
  }
  const [chain, setChain] = useState<ChainStep[]>(initialChain)
  const [savedChain, setSavedChain] = useState<ChainStep[]>(initialChain)
  const [off, setOff] = useState<OffHoursState>(initialOff)
  const [savedOff, setSavedOff] = useState<OffHoursState>(initialOff)
  const [saving, setSaving] = useState(false)
  // #57: refs на 3 textarea — нужны для PlaceholderBadges, чтобы вставлять
  // токен в позицию курсора.
  const textareaRefs = useRef<Array<HTMLTextAreaElement | null>>([null, null, null])

  // Если внешние initial поменялись (refetch вакансии и т.п.) — догоняемся
  // только если у пользователя нет локальных правок.
  useEffect(() => {
    if (!Array.isArray(initial) || initial.length === 0) return
    const incoming = JSON.stringify(initial)
    if (incoming === JSON.stringify(savedChain)) return
    if (JSON.stringify(chain) !== JSON.stringify(savedChain)) return
    const padded = [...initial]
    while (padded.length < 3) padded.push({ enabled: false, delaySeconds: padded.length === 1 ? 60 : 180, text: "" })
    setChain(padded.slice(0, 3))
    setSavedChain(padded.slice(0, 3))
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  // Синхронизация off-hours при refetch — только если нет локальных правок.
  useEffect(() => {
    const incoming: OffHoursState = {
      enabled:      initialOffHoursEnabled,
      delaySeconds: initialOffHoursDelaySeconds,
      text:         initialOffHoursText ?? "",
    }
    if (JSON.stringify(incoming) === JSON.stringify(savedOff)) return
    if (JSON.stringify(off) !== JSON.stringify(savedOff)) return
    setOff(incoming)
    setSavedOff(incoming)
  }, [initialOffHoursEnabled, initialOffHoursDelaySeconds, initialOffHoursText]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    JSON.stringify(chain) !== JSON.stringify(savedChain) ||
    JSON.stringify(off) !== JSON.stringify(savedOff)

  const updateStep = (idx: number, patch: Partial<ChainStep>) => {
    setChain(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/first-messages-chain`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          chain,
          offHoursEnabled:      off.enabled,
          offHoursDelaySeconds: off.delaySeconds,
          offHoursText:         off.text,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "save failed")
      }
      const json = await res.json() as {
        chain?: ChainStep[]
        offHoursEnabled?: boolean
        offHoursDelaySeconds?: number
        offHoursText?: string | null
      }
      const saved = Array.isArray(json.chain) ? json.chain : chain
      const savedOffState: OffHoursState = {
        enabled:      json.offHoursEnabled ?? off.enabled,
        delaySeconds: json.offHoursDelaySeconds ?? off.delaySeconds,
        text:         json.offHoursText ?? off.text,
      }
      setChain(saved)
      setSavedChain(saved)
      setOff(savedOffState)
      setSavedOff(savedOffState)
      onSaved?.(saved)
      toast.success("Напоминания сохранены")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4" />
          Напоминания, если кандидат не ответил
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Авто-напоминания после приглашения, если кандидат не ответил и ещё не
          открыл демо. Как только он ответит или откроет демо — отменяются.
          Само приглашение и текст для нерабочего времени редактируются в табе «Портрет».
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {chain.map((step, idx) => {
          // Сообщение 1 (приглашение) и текст для нерабочего времени редактируются
          // в табе «Портрет» (spec.inviteLetter / spec.offHoursLetter). Здесь —
          // только напоминания 2 и 3; chain[0] и off-hours держим в состоянии и
          // отправляем при сохранении без изменений, но не показываем.
          if (idx === 0) return null
          const delayLabel = idx === 1 ? "Задержка после приглашения" : `Задержка после напоминания ${idx - 1}`
          return (
            <div key={idx} className={!step.enabled ? "opacity-60" : ""}>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Напоминание {idx}</Label>
                <Switch
                  checked={step.enabled}
                  onCheckedChange={(v) => updateStep(idx, { enabled: v })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">{delayLabel}</Label>
                  <Select
                    value={String(step.delaySeconds)}
                    onValueChange={(v) => updateStep(idx, { delaySeconds: Number(v) })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELAY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <textarea
                  ref={(el) => { textareaRefs.current[idx] = el }}
                  className="w-full border rounded-lg p-3 text-sm resize-none h-28 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed"
                  value={step.text}
                  onChange={(e) => updateStep(idx, { text: e.target.value })}
                  placeholder={`Текст напоминания ${idx} (плейсхолдер ссылки опционален)`}
                />
                <PlaceholderBadges
                  getTextarea={() => textareaRefs.current[idx]}
                  placeholders={PLACEHOLDER_TOKENS}
                  value={step.text}
                  onValueChange={(next) => updateStep(idx, { text: next })}
                />
              </div>
            </div>
          )
        })}

        {dirty && (
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
