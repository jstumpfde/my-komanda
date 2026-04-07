"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Sparkles } from "lucide-react"

interface CreateVacancyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CATEGORIES = [
  { id: "sales", name: "Продажи" },
  { id: "it", name: "IT" },
  { id: "operations", name: "Операции" },
  { id: "marketing", name: "Маркетинг" },
  { id: "hr", name: "HR" },
  { id: "finance", name: "Финансы" },
]

const CITIES = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург", "Удалённо"]

const defaultForm = {
  title: "",
  category: "",
  city: "",
  salaryMin: "",
  salaryMax: "",
  description: "",
  aiText: "",
}

export function CreateVacancyDialog({ open, onOpenChange }: CreateVacancyDialogProps) {
  const [form, setForm] = useState(defaultForm)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  function handleChange(field: keyof typeof defaultForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (value.trim()) {
      setErrors((prev) => ({ ...prev, [field]: false }))
    }
  }

  function handleSubmit() {
    const newErrors: Record<string, boolean> = {}
    if (!form.title.trim()) newErrors.title = true
    if (!form.category) newErrors.category = true

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Save AI text for anketa-tab to pick up after navigation
    if (form.aiText.trim()) {
      try {
        sessionStorage.setItem("vacancy_ai_text", form.aiText.trim())
      } catch {}
    }

    toast.success(`Вакансия "${form.title}" создана`, {
      description: form.aiText.trim()
        ? "AI автоматически заполнит анкету"
        : "Вакансия добавлена в список активных",
    })
    setForm(defaultForm)
    setErrors({})
    onOpenChange(false)
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      setForm(defaultForm)
      setErrors({})
    }
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать вакансию</DialogTitle>
          <DialogDescription>
            Заполните информацию о новой вакансии
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="vac-title">Название вакансии *</Label>
            <Input
              id="vac-title"
              placeholder="Например: Менеджер по продажам"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className={errors.title ? "border-red-500" : ""}
            />
            {errors.title && (
              <p className="text-sm text-red-500">Укажите название вакансии</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="vac-category">Категория *</Label>
              <Select value={form.category} onValueChange={(v) => handleChange("category", v)}>
                <SelectTrigger id="vac-category" className={errors.category ? "border-red-500" : ""}>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-red-500">Выберите категорию</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vac-city">Город</Label>
              <Select value={form.city} onValueChange={(v) => handleChange("city", v)}>
                <SelectTrigger id="vac-city">
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map((city) => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="vac-salary-min">Зарплата от, руб.</Label>
              <Input
                id="vac-salary-min"
                type="number"
                placeholder="100 000"
                min={0}
                value={form.salaryMin}
                onChange={(e) => handleChange("salaryMin", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vac-salary-max">Зарплата до, руб.</Label>
              <Input
                id="vac-salary-max"
                type="number"
                placeholder="200 000"
                min={0}
                value={form.salaryMax}
                onChange={(e) => handleChange("salaryMax", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="vac-description">Описание</Label>
            <Textarea
              id="vac-description"
              placeholder="Требования, обязанности, условия..."
              rows={3}
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              className="w-full"
            />
          </div>

          {/* AI text input */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-primary" />
              AI-заполнение
              <span className="text-xs text-muted-foreground font-normal">(необязательно)</span>
            </div>
            <Textarea
              value={form.aiText}
              onChange={(e) => handleChange("aiText", e.target.value)}
              placeholder="Вставьте описание вакансии или должностные обязанности — AI заполнит анкету автоматически..."
              className="h-32 bg-[var(--input-bg)] border border-input resize-none text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit}>Создать вакансию</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
