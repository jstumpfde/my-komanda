"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { X, Plus, Eye, Pencil, UserCircle } from "lucide-react"
import type { VacancyDraft } from "@/lib/vacancy-types"
import { FORMAT_LABELS, EMPLOYMENT_LABELS } from "@/lib/vacancy-types"

interface Props {
  draft: VacancyDraft
  onChange: (draft: VacancyDraft) => void
}

export function StepEditor({ draft, onChange }: Props) {
  const [skillInput, setSkillInput] = useState("")

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Редактор вакансии</h2>
        <p className="text-sm text-muted-foreground">Отредактируйте текст и настройте портрет кандидата</p>
      </div>

      <Tabs defaultValue="edit">
        <TabsList className="mb-4">
          <TabsTrigger value="edit" className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" />
            Редактор
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Превью hh.ru
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
          <Textarea
            className="min-h-[300px] font-mono text-sm"
            value={draft.generatedText}
            onChange={(e) => onChange({ ...draft, generatedText: e.target.value })}
          />
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardContent className="p-6">
              {/* hh.ru style preview */}
              <div className="border-l-4 border-primary pl-4 mb-4">
                <h3 className="text-xl font-bold text-foreground">{draft.title || "Название вакансии"}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {draft.city} • {FORMAT_LABELS[draft.format] || "Офис"} • {EMPLOYMENT_LABELS[draft.employment] || "Полная занятость"}
                </p>
                <p className="text-lg font-semibold text-foreground mt-2">
                  {draft.salaryMin.toLocaleString("ru-RU")} – {draft.salaryMax.toLocaleString("ru-RU")} ₽
                </p>
              </div>

              <div className="prose prose-sm max-w-none text-foreground">
                {draft.generatedText.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(2)}</h2>
                  if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1.5 text-primary">{line.slice(3)}</h3>
                  if (line.startsWith("- ")) return <li key={i} className="text-sm ml-4 mb-1 list-disc">{line.slice(2)}</li>
                  if (line.trim() === "") return <br key={i} />
                  return <p key={i} className="text-sm mb-1">{line}</p>
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Ideal candidate profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-muted-foreground" />
            Портрет идеального кандидата
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Опыт работы</Label>
            <Input
              value={draft.idealExperience}
              onChange={(e) => onChange({ ...draft, idealExperience: e.target.value })}
              placeholder="Например: 3-5 лет"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Ключевые навыки</Label>
            <div className="flex gap-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Добавить навык"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill() } }}
              />
              <Button variant="outline" size="icon" onClick={addSkill}>
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

          <div className="grid gap-1.5">
            <Label>Зарплатные ожидания кандидата</Label>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-20">
                {draft.idealSalaryMin.toLocaleString("ru-RU")} ₽
              </span>
              <Slider
                value={[draft.idealSalaryMin, draft.idealSalaryMax]}
                onValueChange={([min, max]) => onChange({ ...draft, idealSalaryMin: min, idealSalaryMax: max })}
                min={30000}
                max={400000}
                step={5000}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-20 text-right">
                {draft.idealSalaryMax.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
