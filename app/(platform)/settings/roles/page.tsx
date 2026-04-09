"use client"

import { useState, useEffect } from "react"
import { Shield, Check, Info, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const ROLES = [
  {
    role: "director",
    label: "Директор",
    description: "Полный доступ ко всем функциям платформы, включая биллинг и отчёты",
    access: ["Вакансии", "Кандидаты", "Аналитика", "Настройки", "Биллинг", "Отчёты"],
    color: "bg-purple-100 text-purple-700",
  },
  {
    role: "hr_lead",
    label: "Главный HR",
    description: "Управление наймом, адаптацией, обучением и командой HR",
    access: ["Вакансии", "Кандидаты", "Аналитика", "Настройки команды", "Адаптация", "LMS"],
    color: "bg-blue-100 text-blue-700",
  },
  {
    role: "hr_manager",
    label: "HR-менеджер",
    description: "Работа с вакансиями и кандидатами без доступа к настройкам",
    access: ["Вакансии", "Кандидаты", "Интервью"],
    color: "bg-sky-100 text-sky-700",
  },
  {
    role: "department_head",
    label: "Руководитель отдела",
    description: "Просмотр обзора и управление своим отделом",
    access: ["Обзор", "Сотрудники отдела"],
    color: "bg-green-100 text-green-700",
  },
  {
    role: "observer",
    label: "Наблюдатель",
    description: "Только чтение — просмотр без возможности изменений",
    access: ["Обзор (только просмотр)"],
    color: "bg-gray-100 text-gray-600",
  },
]

const PERMISSIONS = [
  { label: "Вакансии",           director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false },
  { label: "Кандидаты",          director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false },
  { label: "Интервью",           director: true,  hr_lead: true,  hr_manager: true,  department_head: false, observer: false },
  { label: "Адаптация",          director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false },
  { label: "LMS / Обучение",     director: true,  hr_lead: true,  hr_manager: false, department_head: true,  observer: false },
  { label: "Оценка навыков",     director: true,  hr_lead: true,  hr_manager: false, department_head: true,  observer: false },
  { label: "Аналитика",          director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false },
  { label: "Настройки компании", director: true,  hr_lead: false, hr_manager: false, department_head: false, observer: false },
  { label: "Команда",            director: true,  hr_lead: true,  hr_manager: false, department_head: false, observer: false },
  { label: "Биллинг",            director: true,  hr_lead: false, hr_manager: false, department_head: false, observer: false },
  { label: "Обзор",              director: true,  hr_lead: true,  hr_manager: true,  department_head: true,  observer: true  },
]

const TRASH_ACCESS_KEY = "mk_trash_access_hr_manager"

export default function RolesPage() {
  const [trashAccessHrManager, setTrashAccessHrManager] = useState(false)

  useEffect(() => {
    setTrashAccessHrManager(localStorage.getItem(TRASH_ACCESS_KEY) === "true")
  }, [])

  const toggleTrashAccess = (checked: boolean) => {
    setTrashAccessHrManager(checked)
    localStorage.setItem(TRASH_ACCESS_KEY, String(checked))
    toast.success(checked ? "HR-менеджеры теперь видят корзину" : "Доступ к корзине для HR-менеджеров отключён")
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Роли и доступ</h1>
        <p className="text-muted-foreground mt-1">Управление правами доступа для каждой роли в системе</p>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p>Роли назначаются в разделе <strong>Настройки → Команда</strong>. Здесь отображается справочник прав доступа для каждой роли.</p>
      </div>

      {/* Trash access setting */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0">
                <Trash2 className="size-4 text-muted-foreground" />
              </div>
              <div>
                <Label htmlFor="trash-access" className="text-sm font-medium">Разрешить HR-менеджерам доступ к корзине</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  По умолчанию корзина доступна только администраторам и руководителям. Включите, чтобы HR-менеджеры тоже могли удалять и восстанавливать вакансии.
                </p>
              </div>
            </div>
            <Switch id="trash-access" checked={trashAccessHrManager} onCheckedChange={toggleTrashAccess} />
          </div>
        </CardContent>
      </Card>

      {/* Role cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLES.map(r => (
          <Card key={r.role}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0">
                  <Shield className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{r.label}</p>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", r.color)}>
                      {r.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.access.map(a => (
                  <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions matrix */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-medium">Матрица прав доступа</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 pr-4 w-40">Раздел</th>
                {ROLES.map(r => (
                  <th key={r.role} className="py-3 px-3 text-xs font-medium text-center">
                    <span className={cn("px-2 py-0.5 rounded-full", r.color)}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(p => (
                <tr key={p.label} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="py-2 pr-4 text-sm">{p.label}</td>
                  {(["director", "hr_lead", "hr_manager", "department_head", "observer"] as const).map(role => (
                    <td key={role} className="py-2 px-3 text-center">
                      {p[role]
                        ? <Check className="size-3.5 text-green-600 mx-auto" />
                        : <span className="text-muted-foreground/30 text-base leading-none">—</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
