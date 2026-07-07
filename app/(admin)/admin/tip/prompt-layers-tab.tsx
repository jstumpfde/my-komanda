"use client"

// Таб «Промпты»: список редактируемых слоёв методики + Sheet-редактор
// (content — методика, может быть большой; textarea моноширинная и высокая).

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Pencil } from "lucide-react"
import { toast } from "sonner"

interface LayerListItem {
  id: string
  layerKey: string
  title: string
  contentLength: number
  isActive: boolean
  updatedAt: string
}

interface LayerFull {
  id: string
  layerKey: string
  title: string
  content: string
  isActive: boolean
  updatedAt: string
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function PromptLayersTab() {
  const [layers, setLayers] = useState<LayerListItem[]>([])
  const [loading, setLoading] = useState(true)

  const [openId, setOpenId] = useState<string | null>(null)
  const [layer, setLayer] = useState<LayerFull | null>(null)
  const [layerLoading, setLayerLoading] = useState(false)
  const [content, setContent] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/tip/prompt-layers")
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Не удалось загрузить слои"); return }
      setLayers(data.layers ?? [])
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!openId) return
    setLayerLoading(true)
    fetch(`/api/admin/tip/prompt-layers/${openId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.layer) {
          setLayer(data.layer)
          setContent(data.layer.content)
          setIsActive(data.layer.isActive)
        } else {
          toast.error(data.error ?? "Не удалось загрузить слой")
        }
      })
      .catch(() => toast.error("Ошибка сети"))
      .finally(() => setLayerLoading(false))
  }, [openId])

  async function save() {
    if (!openId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tip/prompt-layers/${openId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, isActive }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка сохранения"); return }
      toast.success("Слой сохранён")
      setOpenId(null)
      load()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 pt-4">
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />Загрузка…
            </div>
          ) : layers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Слоёв пока нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ключ</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Длина</TableHead>
                    <TableHead>Активен</TableHead>
                    <TableHead>Обновлён</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {layers.map((l) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenId(l.id)}
                    >
                      <TableCell className="font-mono text-xs">{l.layerKey}</TableCell>
                      <TableCell>{l.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.contentLength.toLocaleString("ru-RU")} симв.</TableCell>
                      <TableCell>
                        {l.isActive
                          ? <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">активен</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">выключен</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDateTime(l.updatedAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(l.id) }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null) }}>
        <SheetContent className="sm:max-w-3xl w-full">
          <SheetHeader>
            <SheetTitle>{layer?.title ?? "Слой промпта"}</SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-4">
            {layerLoading || !layer ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />Загрузка…
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">{layer.layerKey}</div>
                <div className="flex items-center gap-2.5">
                  <Switch id="layer-active" checked={isActive} onCheckedChange={setIsActive} />
                  <Label htmlFor="layer-active" className="cursor-pointer">Слой активен</Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="layer-content">Содержимое (методика)</Label>
                  <Textarea
                    id="layer-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="font-mono text-xs min-h-[420px]"
                    spellCheck={false}
                  />
                </div>
              </>
            )}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpenId(null)}>Отмена</Button>
            <Button onClick={save} disabled={saving || layerLoading}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Сохранить
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
