"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Briefcase, Globe, Linkedin, MessageSquare, Mail, Users, QrCode,
  Heart, Building2, Send, Plus, ChevronDown, ChevronRight, Settings2, Trash2,
} from "lucide-react"

// ─── Icons map ─────────────────────────────────────────
export const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Globe, Linkedin, MessageSquare, Mail, Users, QrCode,
  Heart, Building2, Send,
}

const ICON_OPTIONS = Object.keys(ICON_MAP)

export interface SourceItem {
  id: string
  name: string
  icon: string
  enabled: boolean
  custom?: boolean
}

const INITIAL_SOURCES: SourceItem[] = [
  { id: "s1", name: "hh.ru", icon: "Briefcase", enabled: true },
  { id: "s2", name: "LinkedIn", icon: "Linkedin", enabled: true },
  { id: "s3", name: "Telegram", icon: "Send", enabled: true },
  { id: "s4", name: "WhatsApp", icon: "MessageSquare", enabled: true },
  { id: "s5", name: "VK", icon: "Users", enabled: true },
  { id: "s6", name: "Email-рассылка", icon: "Mail", enabled: true },
  { id: "s7", name: "Сайт компании", icon: "Globe", enabled: true },
  { id: "s8", name: "Конференция", icon: "Building2", enabled: true },
  { id: "s9", name: "Реферал", icon: "Heart", enabled: true },
  { id: "s10", name: "Кадровое агентство", icon: "Briefcase", enabled: false },
  { id: "s11", name: "QR-код", icon: "QrCode", enabled: false },
]

interface SourcesManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: SourceItem[]
  onSourcesChange: (sources: SourceItem[]) => void
}

export function SourcesManager({ open, onOpenChange, sources, onSourcesChange }: SourcesManagerProps) {
  const [addMode, setAddMode] = useState(false)
  const [newName, setNewName] = useState("")
  const [newIcon, setNewIcon] = useState("Globe")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editIcon, setEditIcon] = useState("")

  const toggleSource = (id: string) => {
    onSourcesChange(sources.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    onSourcesChange([...sources, { id: `s-${Date.now()}`, name: newName.trim(), icon: newIcon, enabled: true, custom: true }])
    setNewName("")
    setNewIcon("Globe")
    setAddMode(false)
  }

  const handleExpand = (source: SourceItem) => {
    if (expandedId === source.id) {
      setExpandedId(null)
    } else {
      setExpandedId(source.id)
      setEditName(source.name)
      setEditIcon(source.icon)
    }
  }

  const handleSaveEdit = (id: string) => {
    onSourcesChange(sources.map((s) => s.id === id ? { ...s, name: editName, icon: editIcon } : s))
    setExpandedId(null)
  }

  const handleDelete = (id: string) => {
    onSourcesChange(sources.filter((s) => s.id !== id))
    setExpandedId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Источники кандидатов
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {sources.map((source) => {
            const Icon = ICON_MAP[source.icon] || Globe
            const isExpanded = expandedId === source.id
            return (
              <div key={source.id}>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => handleExpand(source)}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  <Icon className={cn("w-4 h-4 shrink-0", source.enabled ? "text-foreground" : "text-muted-foreground/50")} />
                  <span className={cn("flex-1 text-sm", !source.enabled && "text-muted-foreground/50")}>{source.name}</span>
                  <Switch checked={source.enabled} onCheckedChange={() => toggleSource(source.id)} />
                </div>
                {isExpanded && (
                  <div className="ml-10 mr-3 mb-2 p-3 bg-muted/20 rounded-lg border space-y-2">
                    <div className="grid gap-1">
                      <Label className="text-[11px]">Название</Label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-xs" />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px]">Иконка</Label>
                      <Select value={editIcon} onValueChange={setEditIcon}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map((name) => {
                            const Ic = ICON_MAP[name]
                            return <SelectItem key={name} value={name}><div className="flex items-center gap-2"><Ic className="w-3.5 h-3.5" />{name}</div></SelectItem>
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="h-6 text-[11px]" onClick={() => handleSaveEdit(source.id)}>Сохранить</Button>
                      <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setExpandedId(null)}>Отмена</Button>
                      {source.custom && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive ml-auto" onClick={() => handleDelete(source.id)}>
                          <Trash2 className="w-3 h-3 mr-1" />Удалить
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {addMode ? (
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
            <div className="grid gap-1">
              <Label className="text-xs">Название</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название источника" className="h-8 text-sm" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Иконка</Label>
              <Select value={newIcon} onValueChange={setNewIcon}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((name) => {
                    const Ic = ICON_MAP[name]
                    return <SelectItem key={name} value={name}><div className="flex items-center gap-2"><Ic className="w-3.5 h-3.5" />{name}</div></SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs" onClick={handleAdd} disabled={!newName.trim()}>Добавить</Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setAddMode(false)}>Отмена</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full" onClick={() => setAddMode(true)}>
            <Plus className="w-3.5 h-3.5" />Добавить источник
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Export initial sources for use in page
export { INITIAL_SOURCES }
