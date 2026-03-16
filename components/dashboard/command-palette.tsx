"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  BarChart3,
  Calendar,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  UserPlus,
  Users,
} from "lucide-react"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  function navigate(href: string) {
    router.push(href)
    setOpen(false)
  }

  function runAction() {
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Поиск по приложению..." />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>

          <CommandGroup heading="Навигация">
            <CommandItem onSelect={() => navigate("/")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Обзор</span>
            </CommandItem>
            <CommandItem onSelect={() => navigate("/candidates")}>
              <Users className="mr-2 h-4 w-4" />
              <span>Все кандидаты</span>
            </CommandItem>
            <CommandItem onSelect={() => navigate("/interviews")}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>Собеседования</span>
            </CommandItem>
            <CommandItem onSelect={() => navigate("/analytics")}>
              <BarChart3 className="mr-2 h-4 w-4" />
              <span>Аналитика</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Действия">
            <CommandItem onSelect={runAction}>
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Добавить кандидата</span>
            </CommandItem>
            <CommandItem onSelect={runAction}>
              <Plus className="mr-2 h-4 w-4" />
              <span>Создать вакансию</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
