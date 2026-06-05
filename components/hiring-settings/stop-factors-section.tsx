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

export function StopFactorsSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const sf = defaults.stopFactorsDefaults

  // ── Стоп-факторы (плоские состояния) ──
  const [sfCity, setSfCity] = useState<boolean>(!!sf?.city?.enabled)
  const [sfCityValue, setSfCityValue] = useState<string>(
    sf?.city?.allowedCities ? sf.city.allowedCities.join(", ") : ""
  )
  const [sfFormat, setSfFormat] = useState<boolean>(!!sf?.format?.enabled)
  const [sfAge, setSfAge] = useState<boolean>(!!sf?.age?.enabled)
  const [sfAgeMin, setSfAgeMin] = useState<string>(
    sf?.age?.minAge != null ? String(sf.age.minAge) : ""
  )
  const [sfAgeMax, setSfAgeMax] = useState<string>(
    sf?.age?.maxAge != null ? String(sf.age.maxAge) : ""
  )
  const [sfExperience, setSfExperience] = useState<boolean>(!!sf?.experience?.enabled)
  const [sfExpValue, setSfExpValue] = useState<string>(
    sf?.experience?.minYears != null ? String(sf.experience.minYears) : ""
  )
  const [sfDocs, setSfDocs] = useState<boolean>(!!sf?.documents?.enabled)
  const [sfCitizenship, setSfCitizenship] = useState<boolean>(!!sf?.citizenship?.enabled)
  const [sfCitizenshipValue, setSfCitizenshipValue] = useState<string>(
    sf?.citizenship?.allowed ? sf.citizenship.allowed.join(", ") : ""
  )
  const [sfSalary, setSfSalary] = useState<boolean>(!!sf?.salaryExpectation?.enabled)
  const [sfSalaryValue, setSfSalaryValue] = useState<string>(
    sf?.salaryExpectation?.maxAmount != null ? String(sf.salaryExpectation.maxAmount) : ""
  )

  // Мастер-тумблер живого применения ко всем вакансиям
  const [applyToAll, setApplyToAll] = useState<boolean>(
    !!(defaults as CompanyHiringDefaults & { stopFactorsApplyToAll?: boolean }).stopFactorsApplyToAll
  )

  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(true)

  const handleSave = async () => {
    setSaving(true)
    const stopFactorsDefaults: VacancyStopFactors = {
      city: sfCity
        ? { enabled: true, allowedCities: sfCityValue ? sfCityValue.split(",").map(c => c.trim()).filter(Boolean) : [] }
        : { enabled: false },
      format: { enabled: sfFormat },
      age: sfAge
        ? { enabled: true, minAge: Number(sfAgeMin) || undefined, maxAge: Number(sfAgeMax) || undefined }
        : { enabled: false },
      experience: sfExperience
        ? { enabled: true, minYears: Number(sfExpValue) || undefined }
        : { enabled: false },
      documents: { enabled: sfDocs },
      citizenship: sfCitizenship
        ? { enabled: true, allowed: sfCitizenshipValue ? sfCitizenshipValue.split(",").map(c => c.trim()).filter(Boolean) : [] }
        : { enabled: false },
      salaryExpectation: sfSalary
        ? { enabled: true, maxAmount: Number(sfSalaryValue) || undefined }
        : { enabled: false },
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

                {/* Город */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfCity} onCheckedChange={setSfCity} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Город / релокация</p>
                      {sfCity && (
                        <Input
                          value={sfCityValue}
                          onChange={e => setSfCityValue(e.target.value)}
                          placeholder="Например: Москва"
                          className="mt-2 h-8 text-sm bg-[var(--input-bg)] max-w-xs"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Формат работы */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfFormat} onCheckedChange={setSfFormat} />
                    <div>
                      <p className="text-sm font-medium">Формат работы</p>
                      <p className="text-xs text-muted-foreground">офис / гибрид / удалёнка</p>
                    </div>
                  </div>
                </div>

                {/* Возраст */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfAge} onCheckedChange={setSfAge} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Возраст</p>
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

                {/* Опыт */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfExperience} onCheckedChange={setSfExperience} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Минимальный опыт</p>
                      {sfExperience && (
                        <Input
                          value={sfExpValue}
                          onChange={e => setSfExpValue(e.target.value.replace(/\D/g, ""))}
                          placeholder="лет"
                          className="mt-2 w-20 h-8 text-sm bg-[var(--input-bg)]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Документы */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfDocs} onCheckedChange={setSfDocs} />
                    <div>
                      <p className="text-sm font-medium">Обязательные документы</p>
                      <p className="text-xs text-muted-foreground">вод.права, мед.книжка</p>
                    </div>
                  </div>
                </div>

                {/* Гражданство */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfCitizenship} onCheckedChange={setSfCitizenship} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Гражданство</p>
                      {sfCitizenship && (
                        <Input
                          value={sfCitizenshipValue}
                          onChange={e => setSfCitizenshipValue(e.target.value)}
                          placeholder="Например: РФ"
                          className="mt-2 h-8 text-sm bg-[var(--input-bg)] max-w-xs"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Макс зарплата */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3 flex-1">
                    <Switch checked={sfSalary} onCheckedChange={setSfSalary} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Макс. зарплатные ожидания</p>
                      {sfSalary && (
                        <Input
                          value={sfSalaryValue}
                          onChange={e => setSfSalaryValue(e.target.value.replace(/\D/g, ""))}
                          placeholder="руб."
                          className="mt-2 w-32 h-8 text-sm bg-[var(--input-bg)]"
                        />
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
