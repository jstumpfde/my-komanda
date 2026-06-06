"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Building2, MoreHorizontal, Pencil, Archive, RotateCcw, ArrowUpDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

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
  sortColumn?: string | null
  sortDir?: "asc" | "desc"
  onSort?: (column: string) => void
}

export function CompaniesTable({ companies, onEdit, onArchive, onRestore, sortColumn, sortDir, onSort }: CompaniesTableProps) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Нет компаний</p>
      </div>
    )
  }

  return (
    <TableCard>
      <DataTable>
        <DataHead>
          <DataHeadCell className="min-w-[200px]">
            <button type="button" onClick={() => onSort?.("name")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              Название <ArrowUpDown className={cn("w-4 h-4", sortColumn === "name" ? "text-foreground" : "opacity-60")} />
            </button>
          </DataHeadCell>
          <DataHeadCell>ИНН</DataHeadCell>
          <DataHeadCell>Отрасль</DataHeadCell>
          <DataHeadCell>Город</DataHeadCell>
          <DataHeadCell>
            <button type="button" onClick={() => onSort?.("status")} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              Статус <ArrowUpDown className={cn("w-4 h-4", sortColumn === "status" ? "text-foreground" : "opacity-60")} />
            </button>
          </DataHeadCell>
          <DataHeadCell align="right">Действия</DataHeadCell>
        </DataHead>
        <tbody>
          {companies.map((company) => (
            <DataRow key={company.id}>
              <DataCell className="min-w-[200px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{company.name}</p>
                    <p className="text-xs text-muted-foreground">{TYPE_LABELS[company.type] || company.type}</p>
                  </div>
                </div>
              </DataCell>
              <DataCell className="text-muted-foreground font-mono">{company.inn || "—"}</DataCell>
              <DataCell className="text-muted-foreground">{company.industry || "—"}</DataCell>
              <DataCell className="text-muted-foreground">{company.city || "—"}</DataCell>
              <DataCell>
                <Badge className={cn("text-xs border-0", STATUS_COLORS[company.status] || STATUS_COLORS.active)}>
                  {STATUS_LABELS[company.status] || company.status}
                </Badge>
              </DataCell>
              <DataCell align="right">
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
              </DataCell>
            </DataRow>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  )
}
