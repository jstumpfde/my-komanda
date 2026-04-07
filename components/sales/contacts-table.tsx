"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Users, MoreHorizontal, Pencil, Archive, RotateCcw, Phone, Mail, MessageCircle, Star } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface SalesContact {
  id: string
  companyId: string | null
  firstName: string
  lastName: string
  middleName: string | null
  position: string | null
  department: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  telegram: string | null
  whatsapp: string | null
  comment: string | null
  isPrimary: boolean
  status: string
  companyName?: string
}

const STATUS_LABELS: Record<string, string> = {
  active: "Активный",
  archive: "Архив",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archive: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

interface ContactsTableProps {
  contacts: SalesContact[]
  onEdit?: (contact: SalesContact) => void
  onArchive?: (contact: SalesContact) => void
  onRestore?: (contact: SalesContact) => void
}

export function ContactsTable({ contacts, onEdit, onArchive, onRestore }: ContactsTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Нет контактов</p>
      </div>
    )
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Имя</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Должность</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Компания</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 min-w-[150px]">Телефон</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Email</th>
              <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Telegram</th>
              <th className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-8 px-2 py-3">⭐</th>
              <th className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const initials = `${contact.lastName[0] || ""}${contact.firstName[0] || ""}`.toUpperCase()
              const fullName = `${contact.lastName} ${contact.firstName}${contact.middleName ? ` ${contact.middleName}` : ""}`

              return (
                <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">{fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{contact.position || "—"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{contact.companyName || "—"}</td>
                  <td className="px-4 py-3">
                    {contact.phone || contact.mobile ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3 shrink-0" />
                        {contact.phone || contact.mobile}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.email ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{contact.email}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.telegram ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MessageCircle className="w-3 h-3 shrink-0" />
                        {contact.telegram}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center w-8">
                    {contact.isPrimary && (
                      <Star className="w-4 h-4 text-amber-500 mx-auto fill-amber-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit?.(contact)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Редактировать
                        </DropdownMenuItem>
                        {contact.status === "active" ? (
                          <DropdownMenuItem onClick={() => onArchive?.(contact)}>
                            <Archive className="w-4 h-4 mr-2" />
                            В архив
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => onRestore?.(contact)}>
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Восстановить
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
