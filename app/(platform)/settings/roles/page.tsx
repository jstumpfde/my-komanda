"use client"

import { Shield, Check, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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

export default function RolesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Роли и доступ</h1>
        <p className="text-muted-foreground mt-1">Управление правами доступа для каждой роли в системе</p>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p>Роли назначаются в разделе <strong>Настройки → Команда</strong>. Здесь отображается справочник прав доступа для каждой роли.</p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLES.map(r => (
          <Card key={r.role}>
            <CardContent className="pt-5">
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Матрица прав доступа</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-40">Раздел</th>
                {ROLES.map(r => (
                  <th key={r.role} className="py-2 px-3 font-medium text-center">
                    <span className={cn("px-2 py-0.5 rounded-full", r.color)}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(p => (
                <tr key={p.label} className="border-b last:border-0 hover:bg-muted/20">
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
