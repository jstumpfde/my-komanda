"use client"

// Группа 25: UI редактирования структурированных требований вакансии.
// Активирует двухпроходный AI-скоринг v2 (lib/ai-score-candidate-v2.ts).
// API: GET/PUT /api/modules/hr/vacancies/[id]/requirements
//      POST /api/modules/hr/vacancies/[id]/requirements/suggest

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, X, Sparkles, Loader2, RotateCcw, Save, AlertTriangle } from "lucide-react"
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights, type VacancyRequirements } from "@/lib/db/schema"
import { useVacancySectionRegister } from "./vacancy-settings-context"

interface VacancyRequirementsSettingsProps {
  vacancyId:  string
  initial?:   VacancyRequirements | null
  onSaved?:   (req: VacancyRequirements) => void
}

const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  relevant_experience: "Релевантный опыт",
  hard_skills:         "Hard skills",
  tenure_stability:    "Стабильность работы",
  results_in_numbers:  "Цифры результатов",
  soft_skills_fit:     "Soft skills fit",
  company_size_match:  "Размер компаний",
  managerial_match:    "Управленческий опыт",
  education:           "Образование",
  location_readiness:  "Готовность к локации",
}

const PLACEHOLDERS = {
  must:   ["Опыт B2B продаж 3+ года", "Знание Битрикс24"],
  nice:   ["Опыт работы с тендерами", "Английский B1+"],
  deal:   ["Только B2C опыт", "Меньше 1 года в роли"],
  ideal:  "Опытный B2B продавец из стройиндустрии, готовый к длинным сделкам с крупными клиентами. Самостоятельный, ориентирован на результат.",
}

function ListEditor({
  label,
  hint,
  maxItems,
  items,
  setItems,
  placeholders,
}: {
  label:        string
  hint:         string
  maxItems:     number
  items:        string[]
  setItems:     (next: string[]) => void
  placeholders: string[]
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (items.some(x => x.toLowerCase() === t.toLowerCase())) {
      toast.error("Уже есть такой пункт")
      return
    }
    if (items.length >= maxItems) {
      toast.error(`Максимум ${maxItems}`)
      return
    }
    setItems([...items, t])
    setDraft("")
  }
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const update = (i: number, val: string) => {
    const next = [...items]
    next[i] = val
    setItems(next)
  }
  const ph = placeholders[items.length % placeholders.length] || ""

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="text-xs text-muted-foreground">{items.length}/{maxItems}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={it}
              onChange={e => update(i, e.target.value)}
              maxLength={200}
            />
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph}
          maxLength={200}
          disabled={items.length >= maxItems}
        />
        <Button type="button" size="icon" variant="outline" onClick={add} disabled={items.length >= maxItems || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

interface SuggestionResult {
  must_have:      string[]
  nice_to_have:   string[]
  deal_breakers:  string[]
  ideal_profile:  string
}

export function VacancyRequirementsSettings({
  vacancyId,
  initial,
  onSaved,
}: VacancyRequirementsSettingsProps) {
  const init = initial ?? {}
  const [mustHave, setMustHave]         = useState<string[]>(init.must_have ?? [])
  const [niceToHave, setNiceToHave]     = useState<string[]>(init.nice_to_have ?? [])
  const [dealBreakers, setDealBreakers] = useState<string[]>(init.deal_breakers ?? [])
  const [idealProfile, setIdealProfile] = useState<string>(init.ideal_profile ?? "")
  const [weights, setWeights]           = useState<ScoringWeights>(init.scoring_weights ?? DEFAULT_SCORING_WEIGHTS)

  const [suggesting, setSuggesting]   = useState(false)
  const [suggestion, setSuggestion]   = useState<SuggestionResult | null>(null)
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [editedSuggestion, setEditedSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestUnavailable, setSuggestUnavailable] = useState(false)

  // Re-sync с initial при refetch.
  useEffect(() => {
    if (!initial) return
    setMustHave(initial.must_have ?? [])
    setNiceToHave(initial.nice_to_have ?? [])
    setDealBreakers(initial.deal_breakers ?? [])
    setIdealProfile(initial.ideal_profile ?? "")
    setWeights(initial.scoring_weights ?? DEFAULT_SCORING_WEIGHTS)
  }, [initial])

  const weightSum = (Object.keys(weights) as (keyof ScoringWeights)[])
    .reduce((s, k) => s + (weights[k] ?? 0), 0)
  const weightsValid = weightSum === 100

  const save = async () => {
    if (!weightsValid) {
      toast.error("Сумма весов должна быть равна 100")
      throw new Error("weights sum != 100")
    }
    const body: VacancyRequirements = {
      must_have:       mustHave,
      nice_to_have:    niceToHave,
      deal_breakers:   dealBreakers,
      ideal_profile:   idealProfile,
      scoring_weights: weights,
    }
    const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/requirements`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(err?.error || "save failed")
    }
    const json = await res.json() as { requirements?: VacancyRequirements }
    if (json.requirements) onSaved?.(json.requirements)
    toast.success("Требования сохранены")
  }

  const watched = { mustHave, niceToHave, dealBreakers, idealProfile, weights }
  useVacancySectionRegister({
    sectionKey:    "vacancy-requirements",
    tabKey:        "funnel-builder",
    loaded:        true,
    watchedValues: watched,
    save,
  })

  const requestSuggestion = async () => {
    setSuggesting(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/requirements/suggest`, {
        method: "POST",
      })
      if (!res.ok) {
        if (res.status === 404 || res.status === 501) {
          setSuggestUnavailable(true)
          toast.error("AI-предложение недоступно")
          return
        }
        const err = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(err?.error || "suggest failed")
      }
      const json = await res.json() as { suggestion?: SuggestionResult }
      if (!json.suggestion) {
        toast.error("AI вернул пустой ответ")
        return
      }
      setSuggestion(json.suggestion)
      setEditedSuggestion(json.suggestion)
      setSuggestionOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка предложения")
    } finally {
      setSuggesting(false)
    }
  }

  const applySuggestion = () => {
    if (!editedSuggestion) return
    setMustHave(editedSuggestion.must_have.slice(0, 5))
    setNiceToHave(editedSuggestion.nice_to_have.slice(0, 5))
    setDealBreakers(editedSuggestion.deal_breakers.slice(0, 3))
    setIdealProfile(editedSuggestion.ideal_profile.slice(0, 500))
    setSuggestionOpen(false)
    toast.success("Требования применены — не забудьте сохранить")
  }

  const updateWeight = (key: keyof ScoringWeights, val: number) => {
    setWeights({ ...weights, [key]: val })
  }
  const resetWeights = () => setWeights(DEFAULT_SCORING_WEIGHTS)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Структурированные требования к кандидатам</CardTitle>
            <CardDescription>
              Эти требования используются AI для точной оценки. Без них работает упрощённый скоринг (v1).
            </CardDescription>
          </div>
          {!suggestUnavailable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestSuggestion}
              disabled={suggesting}
              className="shrink-0"
            >
              {suggesting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Анализ…</>
                : <><Sparkles className="w-4 h-4 mr-2" /> Предложить из описания</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {mustHave.length === 0 && (
          <Alert>
            <AlertTitle className="text-sm">v2 скоринг неактивен</AlertTitle>
            <AlertDescription className="text-xs">
              Добавьте хотя бы один must-have пункт чтобы активировать новый двухпроходный скоринг.
              v1 продолжает работать параллельно.
            </AlertDescription>
          </Alert>
        )}

        <ListEditor
          label="Жёсткие требования (3-5)"
          hint="Кандидат БЕЗ этих характеристик не подходит"
          maxItems={5}
          items={mustHave}
          setItems={setMustHave}
          placeholders={PLACEHOLDERS.must}
        />

        <ListEditor
          label="Желательно (до 5)"
          hint="Приятные дополнения — не блокеры, но повышают score"
          maxItems={5}
          items={niceToHave}
          setItems={setNiceToHave}
          placeholders={PLACEHOLDERS.nice}
        />

        <div className="space-y-2">
          <Alert variant="default" className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Deal-breakers серьёзно снижают оценку (max 30)
            </AlertDescription>
          </Alert>
          <ListEditor
            label="Что точно НЕ подходит (до 3)"
            hint="Признаки, которые делают кандидата неподходящим"
            maxItems={3}
            items={dealBreakers}
            setItems={setDealBreakers}
            placeholders={PLACEHOLDERS.deal}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Идеальный профиль кандидата</Label>
          <p className="text-xs text-muted-foreground">1-2 предложения, как выглядит идеальный кандидат</p>
          <Textarea
            value={idealProfile}
            onChange={e => setIdealProfile(e.target.value.slice(0, 500))}
            placeholder={PLACEHOLDERS.ideal}
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">{idealProfile.length}/500</p>
        </div>

        <Accordion type="single" collapsible>
          <AccordionItem value="weights">
            <AccordionTrigger className="text-sm">
              Веса критериев скоринга
              <Badge variant={weightsValid ? "secondary" : "destructive"} className="ml-auto mr-3">
                Σ = {weightSum}
              </Badge>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                {(Object.keys(weights) as (keyof ScoringWeights)[]).map(key => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{WEIGHT_LABELS[key]}</span>
                      <span className="text-muted-foreground tabular-nums">{weights[key]}</span>
                    </div>
                    <Slider
                      value={[weights[key]]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={v => updateWeight(key, v[0] ?? 0)}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <p className={`text-xs ${weightsValid ? "text-muted-foreground" : "text-destructive"}`}>
                    {weightsValid
                      ? "Сумма корректна."
                      : `Сумма = ${weightSum}. Должно быть 100.`}
                  </p>
                  <Button type="button" variant="ghost" size="sm" onClick={resetWeights}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Сбросить к дефолту
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => { void save() }}
            disabled={!weightsValid}
          >
            <Save className="w-4 h-4 mr-2" /> Сохранить требования
          </Button>
        </div>
      </CardContent>

      <SuggestionDialog
        open={suggestionOpen}
        onOpenChange={setSuggestionOpen}
        original={suggestion}
        edited={editedSuggestion}
        onEdited={setEditedSuggestion}
        onApply={applySuggestion}
      />
    </Card>
  )
}

function SuggestionDialog({
  open,
  onOpenChange,
  original: _original,
  edited,
  onEdited,
  onApply,
}: {
  open:           boolean
  onOpenChange:   (v: boolean) => void
  original:       SuggestionResult | null
  edited:         SuggestionResult | null
  onEdited:       (v: SuggestionResult) => void
  onApply:        () => void
}) {
  if (!edited) return null
  const setField = (field: keyof SuggestionResult, value: string[] | string) => {
    onEdited({ ...edited, [field]: value } as SuggestionResult)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Предложение AI</DialogTitle>
          <DialogDescription>
            Отредактируйте при необходимости и примените. После применения нажмите «Сохранить требования».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ListEditor
            label="Must-have"
            hint="3-5 жёстких требований"
            maxItems={5}
            items={edited.must_have}
            setItems={v => setField("must_have", v)}
            placeholders={PLACEHOLDERS.must}
          />
          <ListEditor
            label="Nice-to-have"
            hint="до 5 желательных"
            maxItems={5}
            items={edited.nice_to_have}
            setItems={v => setField("nice_to_have", v)}
            placeholders={PLACEHOLDERS.nice}
          />
          <ListEditor
            label="Deal-breakers"
            hint="до 3"
            maxItems={3}
            items={edited.deal_breakers}
            setItems={v => setField("deal_breakers", v)}
            placeholders={PLACEHOLDERS.deal}
          />
          <div className="space-y-2">
            <Label className="text-sm">Идеальный профиль</Label>
            <Textarea
              value={edited.ideal_profile}
              onChange={e => setField("ideal_profile", e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={onApply}>Применить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
