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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Candidate } from "./candidate-card"

interface AddCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (candidate: Candidate) => void
}

const CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Новосибирск",
  "Екатеринбург",
]

const SOURCES = ["hh.ru", "Avito", "LinkedIn", "Telegram"]

const defaultForm = {
  name: "",
  city: "",
  salaryMin: "",
  salaryMax: "",
  experience: "",
  skills: "",
  source: "",
}

export function AddCandidateDialog({
  open,
  onOpenChange,
  onAdd,
}: AddCandidateDialogProps) {
  const [form, setForm] = useState(defaultForm)
  const [nameError, setNameError] = useState(false)

  function handleChange(field: keyof typeof defaultForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === "name" && value.trim()) {
      setNameError(false)
    }
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      setNameError(true)
      return
    }

    const score = Math.floor(Math.random() * (95 - 60 + 1)) + 60

    const candidate: Candidate = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      city: form.city,
      salaryMin: Number(form.salaryMin) || 0,
      salaryMax: Number(form.salaryMax) || 0,
      score,
      progress: 10,
      source: form.source,
      experience: form.experience.trim(),
      skills: form.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      addedAt: new Date(),
      lastSeen: "online",
    }

    onAdd(candidate)
    setForm(defaultForm)
    setNameError(false)
    onOpenChange(false)
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      setForm(defaultForm)
      setNameError(false)
    }
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Добавить кандидата</DialogTitle>
          <DialogDescription>
            Заполните информацию о новом кандидате для добавления в воронку.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* ФИО */}
          <div className="grid gap-1.5">
            <Label htmlFor="name">ФИО</Label>
            <Input
              id="name"
              placeholder="Иванов Иван Иванович"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className={cn(nameError && "border-red-500 focus-visible:ring-red-500")}
            />
            {nameError && (
              <p className="text-sm text-red-500">Пожалуйста, укажите ФИО кандидата</p>
            )}
          </div>

          {/* Город */}
          <div className="grid gap-1.5">
            <Label htmlFor="city">Город</Label>
            <Select value={form.city} onValueChange={(v) => handleChange("city", v)}>
              <SelectTrigger id="city">
                <SelectValue placeholder="Выберите город" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Зарплата */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="salaryMin">Зарплата от, ₽</Label>
              <Input
                id="salaryMin"
                type="number"
                placeholder="100 000"
                min={0}
                value={form.salaryMin}
                onChange={(e) => handleChange("salaryMin", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="salaryMax">Зарплата до, ₽</Label>
              <Input
                id="salaryMax"
                type="number"
                placeholder="200 000"
                min={0}
                value={form.salaryMax}
                onChange={(e) => handleChange("salaryMax", e.target.value)}
              />
            </div>
          </div>

          {/* Опыт работы */}
          <div className="grid gap-1.5">
            <Label htmlFor="experience">Опыт работы</Label>
            <Input
              id="experience"
              placeholder="3 года"
              value={form.experience}
              onChange={(e) => handleChange("experience", e.target.value)}
            />
          </div>

          {/* Навыки */}
          <div className="grid gap-1.5">
            <Label htmlFor="skills">Навыки</Label>
            <Input
              id="skills"
              placeholder="React, TypeScript, Node.js"
              value={form.skills}
              onChange={(e) => handleChange("skills", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Введите навыки через запятую</p>
          </div>

          {/* Источник */}
          <div className="grid gap-1.5">
            <Label htmlFor="source">Источник</Label>
            <Select value={form.source} onValueChange={(v) => handleChange("source", v)}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Выберите источник" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit}>Добавить кандидата</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
