"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ChevronDown } from "lucide-react"
import { MODULE_REGISTRY } from "@/lib/modules/registry"
import type { ModuleId } from "@/lib/modules/types"
import type { SidebarVisibility } from "@/lib/hooks/use-sidebar-visibility"
import { INDUSTRY_PRESETS } from "@/lib/sidebar/industry-presets"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import * as LucideIcons from "lucide-react"

function getIcon(name: string) {
  return (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] || LucideIcons.Settings
}

const ALL_MODULE_IDS = Object.keys(MODULE_REGISTRY) as ModuleId[]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  visibility: SidebarVisibility
  onSave: (v: SidebarVisibility) => void
  onReset: () => void
}

export function SidebarCustomizationSheet({ open, onOpenChange, visibility, onSave, onReset }: Props) {
  const [draft, setDraft] = useState<SidebarVisibility>(visibility)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setDraft(visibility)
      setExpandedModules(new Set())
    }
  }, [open, visibility])

  const isModuleOn = (id: string) => draft.modules[id] !== false
  const isItemOn = (moduleId: string, href: string) => draft.items[`${moduleId}:${href}`] !== false

  const toggleModule = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      modules: { ...prev.modules, [id]: !isModuleOn(id) },
    }))
    setActivePreset(null)
  }

  const toggleItem = (moduleId: string, href: string) => {
    const key = `${moduleId}:${href}`
    setDraft((prev) => ({
      ...prev,
      items: { ...prev.items, [key]: !isItemOn(moduleId, href) },
    }))
    setActivePreset(null)
  }

  const toggleExpanded = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const applyPreset = (preset: typeof INDUSTRY_PRESETS[number]) => {
    if (preset.id === "custom") {
      setActivePreset("custom")
      return
    }
    const modules: Record<string, boolean> = {}
    for (const id of ALL_MODULE_IDS) {
      modules[id] = preset.modules.includes(id)
    }
    setDraft({ modules, items: {} })
    setActivePreset(preset.id)
    toast.success(`Применён пресет: ${preset.label}`)
  }

  const handleSave = () => {
    onSave(draft)
    onOpenChange(false)
    toast.success("Меню обновлено")
  }

  const handleReset = () => {
    onReset()
    setDraft({ modules: {}, items: {} })
    setActivePreset(null)
    onOpenChange(false)
    toast.success("Меню сброшено")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Настройка меню</SheetTitle>
          <p className="text-sm text-muted-foreground">Выберите модули и пункты для отображения</p>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1">
          {/* Presets */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Быстрая настройка по отрасли</p>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-all text-xs hover:border-primary/50",
                    activePreset === p.id ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <span className="text-base mr-1">{p.emoji}</span>
                  <span className="font-medium">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Modules */}
          <div className="space-y-1 pl-1">
            {ALL_MODULE_IDS.map((id) => {
              const mod = MODULE_REGISTRY[id]
              if (!mod) return null
              const ModIcon = getIcon(mod.icon)
              const moduleOn = isModuleOn(id)
              const hasItems = mod.menuItems.length > 0
              const isExpanded = expandedModules.has(id)

              return (
                <div key={id} className="rounded-lg border border-transparent hover:border-border/50 transition-colors">
                  {/* Module row */}
                  <div className="flex items-center gap-1 py-1.5 px-2">
                    <Checkbox
                      checked={moduleOn}
                      onCheckedChange={() => toggleModule(id)}
                    />
                    <button
                      className="flex items-center gap-2 flex-1 min-w-0 ml-1"
                      onClick={() => hasItems && moduleOn && toggleExpanded(id)}
                    >
                      <ModIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{mod.name}</span>
                    </button>
                    {hasItems && moduleOn && (
                      <button
                        onClick={() => toggleExpanded(id)}
                        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                      >
                        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                      </button>
                    )}
                    {hasItems && moduleOn && (
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">{mod.menuItems.length}</span>
                    )}
                  </div>

                  {/* Subitems (collapsible) */}
                  {moduleOn && hasItems && isExpanded && (
                    <div className="pl-10 pr-2 pb-2 space-y-0.5">
                      {mod.menuItems.map((item) => (
                        <label key={item.href} className="flex items-center gap-2 cursor-pointer py-0.5">
                          <Checkbox
                            checked={isItemOn(id, item.href)}
                            onCheckedChange={() => toggleItem(id, item.href)}
                          />
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-background py-3 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={handleReset}>Сбросить</Button>
            <Button className="flex-1" onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
