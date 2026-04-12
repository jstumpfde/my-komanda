"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
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
  // Local draft state
  const [draft, setDraft] = useState<SidebarVisibility>(visibility)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  useEffect(() => {
    if (open) setDraft(visibility)
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

        <div className="mt-6 space-y-6">
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
          <div className="space-y-3">
            {ALL_MODULE_IDS.map((id) => {
              const mod = MODULE_REGISTRY[id]
              if (!mod) return null
              const ModIcon = getIcon(mod.icon)
              const moduleOn = isModuleOn(id)

              return (
                <div key={id}>
                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <Checkbox
                      checked={moduleOn}
                      onCheckedChange={() => toggleModule(id)}
                    />
                    <ModIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{mod.name}</span>
                  </label>

                  {moduleOn && mod.menuItems.length > 0 && (
                    <div className="pl-9 mt-1 space-y-0.5">
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
