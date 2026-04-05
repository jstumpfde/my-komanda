"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Building2, MoreHorizontal, Pencil, Archive, RotateCcw } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface SalesCompany {
  id: string
  name: string
  inn: string | null
  kpp: string | null
  ogrn: string | null
  industry: string | null
  city: string | null
  address: string | null
  website: string | null
  phone: string | null
  email: string | null
  revenue: string | null
  employeesCount: number | null
  description: string | null
  logoUrl: string | null
  type: string
  status: string
  contactsCount?: number
  vacanciesCount?: number
}

const TYPE_LABELS: Record<string, string> = {
  client: "Клиент",
  partner: "Партнёр",
  own: "Своя",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Активная",
  archive: "Архив",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

interface CompaniesTableProps {
  companies: SalesCompany[]
  onEdit?: (company: SalesCompany) => void
  onArchive?: (company: SalesCompany) => void
  onRestore?: (company: SalesCompany) => void
}

export function CompaniesTable({ companies, onEdit, onArchive, onRestore }: CompaniesTableProps) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Нет компаний</p>
      </div>
    )
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Название</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">ИНН</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Отрасль</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Город</th>
              <th className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Контактов</th>
              <th className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Вакансий</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Статус</th>
              <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{company.name}</p>
                      <p className="text-xs text-muted-foreground">{TYPE_LABELS[company.type] || company.type}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{company.inn || "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{company.industry || "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{company.city || "—"}</td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">{company.contactsCount ?? 0}</td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">{company.vacanciesCount ?? 0}</td>
                <td className="px-4 py-3">
                  <Badge className={cn("text-xs border-0", STATUS_COLORS[company.status] || STATUS_COLORS.active)}>
                    {STATUS_LABELS[company.status] || company.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(company)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      {company.status === "active" ? (
                        <DropdownMenuItem onClick={() => onArchive?.(company)}>
                          <Archive className="w-4 h-4 mr-2" />
                          В архив
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => onRestore?.(company)}>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Восстановить
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
