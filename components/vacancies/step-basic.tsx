"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { VacancyDraft } from "@/lib/vacancy-types"
import { CITIES, VACANCY_CATEGORIES, SIDEBAR_SECTIONS } from "@/lib/vacancy-types"

interface Props {
  draft: VacancyDraft
  onChange: (draft: VacancyDraft) => void
}

export function StepBasic({ draft, onChange }: Props) {
  const update = (field: keyof VacancyDraft, value: unknown) =>
    onChange({ ...draft, [field]: value })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">Базовая информация</h2>
        <p className="text-sm text-muted-foreground">Укажите основные параметры вакансии</p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label>Название должности *</Label>
          <Input
            placeholder="Например: Менеджер по продажам"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label>Город *</Label>
            <Select value={draft.city} onValueChange={(v) => update("city", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите город" /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Категория *</Label>
            <Select value={draft.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                {VACANCY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Раздел меню *</Label>
          <Select value={draft.sidebarSection} onValueChange={(v) => update("sidebarSection", v)}>
            <SelectTrigger><SelectValue placeholder="В какой раздел добавить" /></SelectTrigger>
            <SelectContent>
              {SIDEBAR_SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Вакансия появится в этом разделе сайдбара. Потом можно перетянуть.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label>Формат работы</Label>
            <Select value={draft.format} onValueChange={(v) => update("format", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите формат" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Офис</SelectItem>
                <SelectItem value="hybrid">Гибрид</SelectItem>
                <SelectItem value="remote">Удалёнка</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Занятость</Label>
            <Select value={draft.employment} onValueChange={(v) => update("employment", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Полная занятость</SelectItem>
                <SelectItem value="part">Частичная занятость</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
