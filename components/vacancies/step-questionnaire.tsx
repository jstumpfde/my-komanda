"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sparkles, Loader2, Paperclip, Plus, X } from "lucide-react"
import type { VacancyDraft } from "@/lib/vacancy-types"

interface Props {
  draft: VacancyDraft
  onChange: (draft: VacancyDraft) => void
}

const EXPERIENCE_LEVELS = [
  { value: "none", label: "Не имеет значения" },
  { value: "intern", label: "Без опыта (стажёр)" },
  { value: "1-3", label: "1–3 года" },
  { value: "3-6", label: "3–6 лет" },
  { value: "6+", label: "Более 6 лет" },
]

const EMPLOYMENT_OPTIONS = [
  { value: "full", label: "Полная занятость" },
  { value: "part", label: "Частичная занятость" },
  { value: "project", label: "Проектная работа" },
  { value: "volunteer", label: "Волонтёрство" },
  { value: "internship", label: "Стажировка" },
]

const SCHEDULE_OPTIONS = [
  { value: "full-day", label: "Полный день" },
  { value: "shift", label: "Сменный график" },
  { value: "flexible", label: "Гибкий график" },
  { value: "remote", label: "Удалённая работа" },
  { value: "fly-in", label: "Вахтовый метод" },
]

function generateVacancyText(draft: VacancyDraft): string {
  const title = draft.title || "Специалист"
  const exp = EXPERIENCE_LEVELS.find((e) => e.value === draft.experienceLevel)?.label || ""
  const empTypes = draft.employmentTypes.map((t) => EMPLOYMENT_OPTIONS.find((o) => o.value === t)?.label).filter(Boolean).join(", ")
  const schedTypes = draft.scheduleTypes.map((t) => SCHEDULE_OPTIONS.find((o) => o.value === t)?.label).filter(Boolean).join(", ")
  const skills = draft.idealSkills.length > 0 ? draft.idealSkills.join(", ") : ""

  return `# ${title}

## О компании
${draft.companyDescription || "Мы — динамично развивающаяся компания, лидер в своём сегменте рынка."}

## Обязанности
${draft.dailyTasks || "- Выполнение ключевых задач по направлению\n- Взаимодействие с командой и клиентами"}

## Требования
${draft.requirements || "- Релевантный опыт работы\n- Высшее образование"}
${exp ? `\nОпыт работы: ${exp}` : ""}
${skills ? `\nКлючевые навыки: ${skills}` : ""}

## Условия
${draft.benefits || "- Конкурентная заработная плата\n- ДМС\n- Профессиональное развитие"}

## Детали
- Зарплата: ${draft.salaryMin.toLocaleString("ru-RU")} – ${draft.salaryMax.toLocaleString("ru-RU")} ₽
- Город: ${draft.city || "Москва"}
${empTypes ? `- Занятость: ${empTypes}` : ""}
${schedTypes ? `- График: ${schedTypes}` : ""}`
}

export function StepQuestionnaire({ draft, onChange }: Props) {
  const [generating, setGenerating] = useState(false)
  const [skillInput, setSkillInput] = useState("")

  const toggleCheckbox = (field: "employmentTypes" | "scheduleTypes", value: string) => {
    const current = draft[field]
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onChange({ ...draft, [field]: updated })
  }

  const addSkill = () => {
    const skill = skillInput.trim()
    if (skill && !draft.idealSkills.includes(skill)) {
      onChange({ ...draft, idealSkills: [...draft.idealSkills, skill] })
      setSkillInput("")
    }
  }

  const removeSkill = (skill: string) => {
    onChange({ ...draft, idealSkills: draft.idealSkills.filter((s) => s !== skill) })
  }

  const handleGenerate = () => {
    setGenerating(true)
    setTimeout(() => {
      onChange({ ...draft, generatedText: generateVacancyText(draft) })
      setGenerating(false)
    }, 1500)
  }

  const hasSomeContent = draft.dailyTasks.trim() || draft.requirements.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Описание вакансии</h2>
        <p className="text-sm text-muted-foreground">Заполните как на hh.ru — AI сгенерирует текст из ваших данных</p>
      </div>

      {/* Experience level */}
      <div className="grid gap-1.5">
        <Label>Опыт работы</Label>
        <Select value={draft.experienceLevel} onValueChange={(v) => onChange({ ...draft, experienceLevel: v })}>
          <SelectTrigger><SelectValue placeholder="Выберите опыт" /></SelectTrigger>
          <SelectContent>
            {EXPERIENCE_LEVELS.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employment type checkboxes */}
      <div className="grid gap-2">
        <Label>Тип занятости</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {EMPLOYMENT_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`emp-${opt.value}`}
                checked={draft.employmentTypes.includes(opt.value)}
                onCheckedChange={() => toggleCheckbox("employmentTypes", opt.value)}
              />
              <label htmlFor={`emp-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule checkboxes */}
      <div className="grid gap-2">
        <Label>График работы</Label>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {SCHEDULE_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-2">
              <Checkbox
                id={`sched-${opt.value}`}
                checked={draft.scheduleTypes.includes(opt.value)}
                onCheckedChange={() => toggleCheckbox("scheduleTypes", opt.value)}
              />
              <label htmlFor={`sched-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</label>
            </div>
          ))}
        </div>
      </div>

      {/* Skills tags */}
      <div className="grid gap-1.5">
        <Label>Ключевые навыки</Label>
        <div className="flex gap-2">
          <Input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            placeholder="Добавить навык и Enter"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill() } }}
          />
          <Button variant="outline" size="icon" onClick={addSkill} type="button">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {draft.idealSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {draft.idealSkills.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button onClick={() => removeSkill(skill)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* About company */}
      <div className="grid gap-1.5">
        <Label>О компании</Label>
        <Textarea
          placeholder="Чем занимается компания, какой продукт, размер команды..."
          rows={3}
          value={draft.companyDescription}
          onChange={(e) => onChange({ ...draft, companyDescription: e.target.value })}
        />
      </div>

      {/* Responsibilities */}
      <div className="grid gap-1.5">
        <Label>Обязанности *</Label>
        <Textarea
          placeholder="Что будет делать сотрудник каждый день..."
          rows={4}
          value={draft.dailyTasks}
          onChange={(e) => onChange({ ...draft, dailyTasks: e.target.value })}
        />
      </div>

      {/* Requirements */}
      <div className="grid gap-1.5">
        <Label>Требования *</Label>
        <Textarea
          placeholder="Обязательные требования к кандидату..."
          rows={4}
          value={draft.requirements}
          onChange={(e) => onChange({ ...draft, requirements: e.target.value })}
        />
      </div>

      {/* Benefits / Conditions */}
      <div className="grid gap-1.5">
        <Label>Условия</Label>
        <Textarea
          placeholder="Зарплата, бонусы, ДМС, обучение, карьерный рост..."
          rows={3}
          value={draft.benefits}
          onChange={(e) => onChange({ ...draft, benefits: e.target.value })}
        />
      </div>

      {/* Extra link */}
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Ссылка на доп. материалы
        </Label>
        <Input
          placeholder="https://..."
          value={draft.extraLink}
          onChange={(e) => onChange({ ...draft, extraLink: e.target.value })}
        />
      </div>

      {/* Generate button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerate}
        disabled={generating || !hasSomeContent}
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            AI генерирует вакансию...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Сгенерировать с AI
          </>
        )}
      </Button>
    </div>
  )
}
