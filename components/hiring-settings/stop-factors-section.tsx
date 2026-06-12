"use client"

import { useState } from "react"
import { ShieldAlert, Save, ChevronDown, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CompanyHiringDefaults, VacancyStopFactors } from "@/lib/db/schema"

// Каноничные названия гражданств — как их отдаёт hh (важно для совпадения при
// матчинге стоп-фактора). Выбираются чипами, чтобы HR не угадывал формат «РФ».
const CITIZENSHIPS = [
  "Россия", "Беларусь", "Казахстан", "Узбекистан", "Киргизия", "Таджикистан",
  "Армения", "Азербайджан", "Украина", "Молдова", "Грузия", "Туркменистан",
]
// Алиасы старых сокращений → каноничное (чтобы уже сохранённые «РФ/БЛ/КЗ» подхватились).
const CITIZENSHIP_ALIASES: Record<string, string> = {
  "рф": "Россия", "россия": "Россия",
  "бл": "Беларусь", "рб": "Беларусь", "беларусь": "Беларусь", "белоруссия": "Беларусь",
  "кз": "Казахстан", "рк": "Казахстан", "казахстан": "Казахстан",
  "уз": "Узбекистан", "узбекистан": "Узбекистан",
  "кг": "Киргизия", "киргизия": "Киргизия", "кыргызстан": "Киргизия",
  "тж": "Таджикистан", "таджикистан": "Таджикистан",
  "ам": "Армения", "армения": "Армения",
  "аз": "Азербайджан", "азербайджан": "Азербайджан",
  "уа": "Украина", "украина": "Украина",
  "мд": "Молдова", "молдова": "Молдова", "молдавия": "Молдова",
  "гр": "Грузия", "грузия": "Грузия",
  "тм": "Туркменистан", "туркменистан": "Туркменистан",
}
function normalizeCitizenship(s: string): string {
  const k = s.trim().toLowerCase()
  if (CITIZENSHIP_ALIASES[k]) return CITIZENSHIP_ALIASES[k]
  const canon = CITIZENSHIPS.find(c => c.toLowerCase() === k)
  return canon ?? s.trim()
}

export function StopFactorsSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const sf = defaults.stopFactorsDefaults

  // ── Стоп-факторы (компанейский уровень — только базовые: Возраст, Гражданство).
  // Детальные (город/формат/опыт/документы/зарплата) задаются на каждой вакансии.
  const [sfAge, setSfAge] = useState<boolean>(!!sf?.age?.enabled)
  const [sfAgeMin, setSfAgeMin] = useState<string>(
    sf?.age?.minAge != null ? String(sf.age.minAge) : ""
  )
  const [sfAgeMax, setSfAgeMax] = useState<string>(
    sf?.age?.maxAge != null ? String(sf.age.maxAge) : ""
  )
  const [sfCitizenship, setSfCitizenship] = useState<boolean>(!!sf?.citizenship?.enabled)
  const [sfCitizenshipList, setSfCitizenshipList] = useState<string[]>(
    Array.isArray(sf?.citizenship?.allowed)
      ? [...new Set(sf!.citizenship!.allowed!.map(normalizeCitizenship))]
      : []
  )
  const toggleCitizenship = (c: string) =>
    setSfCitizenshipList(list => list.includes(c) ? list.filter(x => x !== c) : [...list, c])

  // Мастер-тумблер живого применения ко всем вакансиям
  const [applyToAll, setApplyToAll] = useState<boolean>(
    !!(defaults as CompanyHiringDefaults & { stopFactorsApplyToAll?: boolean }).stopFactorsApplyToAll
  )

  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(true)

  const handleSave = async () => {
    setSaving(true)
    // Компанейский уровень: только Возраст + Гражданство. Остальные факторы
    // на компании отключены (детально задаются на каждой вакансии).
    const stopFactorsDefaults: VacancyStopFactors = {
      age: sfAge
        ? { enabled: true, minAge: Number(sfAgeMin) || undefined, maxAge: Number(sfAgeMax) || undefined }
        : { enabled: false },
      citizenship: sfCitizenship
        ? { enabled: true, allowed: sfCitizenshipList }
        : { enabled: false },
      city: { enabled: false },
      format: { enabled: false },
      experience: { enabled: false },
      documents: { enabled: false },
      salaryExpectation: { enabled: false },
    }
    try {
      await onPatch({
        stopFactorsDefaults,
        // stopFactorsApplyToAll добавляется schema-агентом — кастуем через spread
        ...({ stopFactorsApplyToAll: applyToAll } as Partial<CompanyHiringDefaults>),
      })
      toast.success("Стоп-факторы сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="mb-5 max-w-3xl">
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-between w-full text-left group"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-violet-600" />
                <CardTitle className="text-sm font-medium">Общие стоп-факторы компании</CardTitle>
                {/* Индикатор в свёрнутом виде: показываем если мастер-тумблер включён */}
                {!open && applyToAll && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal text-amber-700 bg-amber-50 border-amber-200">
                    Применяется ко всем
                  </Badge>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180",
                  open && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CardDescription className="mt-1">
            Минимальный базовый набор стоп-факторов для всей компании. Указывайте здесь только самые важные общие правила — детальные стоп-факторы лучше задавать на каждой вакансии.
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">

            {/* ── Мастер-тумблер живого применения ── */}
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                      <p className="text-sm font-medium">Применять ко всем вакансиям</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Когда включено — эти стоп-факторы применяются ко всем вакансиям компании
                      при автоматической обработке откликов. Включайте осознанно: кандидаты,
                      попадающие под фактор, будут автоматически отклоняться по всем вакансиям.
                    </p>
                    {/* Явный статус — чтобы было однозначно понятно, работает или нет. */}
                    <p className={cn(
                      "text-xs font-medium mt-1",
                      applyToAll ? "text-green-700 dark:text-green-400" : "text-muted-foreground",
                    )}>
                      {applyToAll
                        ? "✓ Сейчас применяются ко всем вакансиям."
                        : "Сейчас НЕ применяются ко всем — это только базовый шаблон для вакансий."}
                    </p>
                  </div>
                  <Switch
                    checked={applyToAll}
                    onCheckedChange={setApplyToAll}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Стоп-факторы */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="size-4 text-violet-600" />Стоп-факторы для нового резюме
                </CardTitle>
                <CardDescription>
                  Критерии отсева на этапе AI-скоринга резюме (НЕ стоп-слова в чате).
                  В каждой вакансии можно уточнить или изменить эти правила.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!applyToAll && (
                  <p className="text-xs text-amber-600 mb-1">
                    Мастер-тумблер выше выключен — эти факторы сейчас НЕ применяются ко всем
                    вакансиям. Они работают как базовый шаблон (подхватываются на уровне вакансии).
                  </p>
                )}

                {/* Возраст */}
                <div className={cn("flex items-center justify-between rounded-lg border p-4", !applyToAll && "opacity-70")}>
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfAge} onCheckedChange={setSfAge} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Возраст</p>
                        <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5 font-normal",
                          !sfAge ? "text-muted-foreground"
                            : applyToAll ? "text-green-700 border-green-300"
                            : "text-amber-600 border-amber-300")}>
                          {!sfAge ? "Выкл" : applyToAll ? "Применяется" : "Только шаблон"}
                        </Badge>
                      </div>
                      {sfAge && (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            value={sfAgeMin}
                            onChange={e => setSfAgeMin(e.target.value.replace(/\D/g, ""))}
                            placeholder="мин"
                            className="w-20 h-8 text-sm bg-[var(--input-bg)]"
                          />
                          <span className="text-xs text-muted-foreground">—</span>
                          <Input
                            value={sfAgeMax}
                            onChange={e => setSfAgeMax(e.target.value.replace(/\D/g, ""))}
                            placeholder="макс"
                            className="w-20 h-8 text-sm bg-[var(--input-bg)]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Гражданство */}
                <div className={cn("flex items-start justify-between rounded-lg border p-4", !applyToAll && "opacity-70")}>
                  <div className="flex items-start gap-3 flex-1">
                    <Switch checked={sfCitizenship} onCheckedChange={setSfCitizenship} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Гражданство</p>
                        <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5 font-normal",
                          !sfCitizenship ? "text-muted-foreground"
                            : applyToAll ? "text-green-700 border-green-300"
                            : "text-amber-600 border-amber-300")}>
                          {!sfCitizenship ? "Выкл" : applyToAll ? "Применяется" : "Только шаблон"}
                        </Badge>
                      </div>
                      {sfCitizenship && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            Разрешённые гражданства — кандидаты с другими отклоняются. Выберите из списка:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {CITIZENSHIPS.map(c => {
                              const on = sfCitizenshipList.includes(c)
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => toggleCitizenship(c)}
                                  className={cn(
                                    "text-xs rounded-full border px-2.5 py-1 transition-colors",
                                    on ? "bg-violet-600 text-white border-violet-600"
                                       : "bg-muted/40 border-border hover:bg-muted",
                                  )}
                                >
                                  {c}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Кнопка сохранения */}
            <div className="flex justify-end">
              <Button className="gap-2" onClick={handleSave} disabled={saving}>
                <Save className="size-4" />Сохранить
              </Button>
            </div>

          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
