"use client"

// /big-life/covers — CRUD архива обложек Big Life + публикация статической
// страницы. Данные грузит сам клиент через /api/modules/big-life/covers.
import { useEffect, useState, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import {
  Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  RefreshCw, Plus, Pencil, Trash2, UploadCloud, Image as ImageIcon, Rows3, LayoutGrid, X,
} from "lucide-react"

interface Cover {
  id: string
  title: string
  heading: string
  period: string | null
  year: string
  imagePath: string | null
  price: number | null
  salePrice: number | null
  stockQty: number | null
  soldOut: boolean
  isActive: boolean
  sortOrder: number
}

type FormState = {
  title: string
  heading: string
  period: string
  year: string
  imagePath: string
  price: string
  salePrice: string
  stockQty: string
  soldOut: boolean
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  title: "", heading: "", period: "", year: "", imagePath: "",
  price: "", salePrice: "", stockQty: "", soldOut: false, isActive: true,
}

function toForm(c: Cover): FormState {
  return {
    title: c.title,
    heading: c.heading,
    period: c.period ?? "",
    year: c.year,
    imagePath: c.imagePath ?? "",
    price: c.price != null ? String(c.price) : "",
    salePrice: c.salePrice != null ? String(c.salePrice) : "",
    stockQty: c.stockQty != null ? String(c.stockQty) : "",
    soldOut: c.soldOut,
    isActive: c.isActive,
  }
}

function toPayload(f: FormState) {
  return {
    title: f.title.trim(),
    heading: f.heading.trim(),
    period: f.period.trim() || null,
    year: f.year.trim(),
    imagePath: f.imagePath.trim() || null,
    price: f.price.trim() ? Number(f.price) : null,
    salePrice: f.salePrice.trim() ? Number(f.salePrice) : null,
    stockQty: f.stockQty.trim() ? Number(f.stockQty) : null,
    soldOut: f.soldOut,
    isActive: f.isActive,
  }
}

export function BigLifeCoversClient() {
  const [covers, setCovers] = useState<Cover[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Cover | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<"table" | "cards">("table")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPrice, setBulkPrice] = useState("")
  const [bulkSalePrice, setBulkSalePrice] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/modules/big-life/covers", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка загрузки")
      setCovers(d.covers || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const selectedIds = useMemo(() => Array.from(selected), [selected])
  const allSelected = covers.length > 0 && selected.size === covers.length

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(covers.map(c => c.id)))
  }
  function toggleSelectOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSheetOpen(true)
  }

  function openEdit(c: Cover) {
    setEditing(c)
    setForm(toForm(c))
    setSheetOpen(true)
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch("/api/modules/big-life/covers/upload-image", { method: "POST", body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка загрузки файла")
      setForm(f => ({ ...f, imagePath: d.imagePath }))
      toast.success("Обложка загружена")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.title.trim() || !form.heading.trim() || !form.year.trim()) {
      toast.error("Название, подпись и год обязательны")
      return
    }
    setSaving(true)
    try {
      const payload = toPayload(form)
      const url = editing ? `/api/modules/big-life/covers/${editing.id}` : "/api/modules/big-life/covers"
      const method = editing ? "PATCH" : "POST"
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка сохранения")
      toast.success(editing ? "Обложка обновлена" : "Обложка добавлена")
      setSheetOpen(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await fetch(`/api/modules/big-life/covers/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error("Ошибка удаления")
      toast.success("Обложка удалена")
      setCovers(prev => prev.filter(c => c.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    }
  }

  async function toggleActive(c: Cover, isActive: boolean) {
    setCovers(prev => prev.map(x => (x.id === c.id ? { ...x, isActive } : x)))
    try {
      const r = await fetch(`/api/modules/big-life/covers/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
      })
      if (!r.ok) throw new Error()
    } catch {
      toast.error("Не удалось сохранить")
      load()
    }
  }

  async function bulkPatch(patch: Record<string, unknown>, successMsg: string) {
    if (selectedIds.length === 0) return
    setBulkBusy(true)
    try {
      const r = await fetch("/api/modules/big-life/covers/bulk", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds, ...patch }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка")
      toast.success(`${successMsg}: ${d.count}`)
      clearSelection()
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return
    setBulkBusy(true)
    try {
      const r = await fetch("/api/modules/big-life/covers/bulk", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка")
      toast.success(`Удалено: ${d.count}`)
      clearSelection()
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkPriceApply() {
    await bulkPatch({
      price: bulkPrice.trim() ? Number(bulkPrice) : null,
      salePrice: bulkSalePrice.trim() ? Number(bulkSalePrice) : null,
    }, "Цена обновлена")
    setBulkPriceOpen(false)
    setBulkPrice("")
    setBulkSalePrice("")
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      const r = await fetch("/api/modules/big-life/covers/publish", { method: "POST" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка публикации")
      toast.success(`Опубликовано: ${d.count} обложек на biglife.company24.pro`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка публикации")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-primary" /> Обложки Big Life
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Архив biglife.company24.pro/Big Life Covers.dc.html — цена, скидка, остаток, наличие.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={view === "table" ? "default" : "ghost"}
              size="icon"
              className="rounded-none h-9 w-9"
              onClick={() => setView("table")}
              title="Табличный вид"
            >
              <Rows3 className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "cards" ? "default" : "ghost"}
              size="icon"
              className="rounded-none h-9 w-9"
              onClick={() => setView("cards")}
              title="Карточки"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Обновить">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Добавить обложку
          </Button>
          <Button onClick={handlePublish} disabled={publishing}>
            <UploadCloud className={`h-4 w-4 mr-1 ${publishing ? "animate-pulse" : ""}`} />
            {publishing ? "Публикуем…" : "Опубликовать на сайт"}
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkPatch({ soldOut: true }, "Помечено «нет в наличии»")}>
            Нет в наличии
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkPatch({ soldOut: false }, "Помечено «в наличии»")}>
            Есть в наличии
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => setBulkPriceOpen(true)}>
            Задать цену
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkPatch({ isActive: true }, "Показаны на сайте")}>
            Показать
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkPatch({ isActive: false }, "Скрыты с сайта")}>
            Скрыть
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Удалить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить {selected.size} обложек?</AlertDialogTitle>
                <AlertDialogDescription>Действие необратимо. Файлы изображений на диске не удаляются.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={bulkDelete}>Удалить</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            <X className="h-3.5 w-3.5 mr-1" /> Снять выбор
          </Button>
        </div>
      )}

      {bulkPriceOpen && (
        <div className="flex items-end gap-3 bg-muted/50 border rounded-lg p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Цена, ₽ (пусто — убрать)</label>
            <Input type="number" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} className="w-32 h-8" placeholder="1900" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Со скидкой, ₽</label>
            <Input type="number" value={bulkSalePrice} onChange={(e) => setBulkSalePrice(e.target.value)} className="w-32 h-8" placeholder="1500" />
          </div>
          <Button size="sm" disabled={bulkBusy} onClick={handleBulkPriceApply}>Применить к {selected.size}</Button>
          <Button size="sm" variant="ghost" onClick={() => setBulkPriceOpen(false)}>Отмена</Button>
        </div>
      )}

      {loading && covers.length === 0 && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {!loading && covers.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">Обложек пока нет.</Card>
      )}

      {!loading && covers.length > 0 && view === "table" && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Выбрать все" />
                </TableHead>
                <TableHead className="w-14">Фото</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Год / период</TableHead>
                <TableHead>Цена</TableHead>
                <TableHead>Остаток</TableHead>
                <TableHead>Наличие</TableHead>
                <TableHead>На сайте</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {covers.map((c) => {
                const soldOut = c.soldOut || (c.stockQty != null && c.stockQty <= 0)
                return (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelectOne(c.id)} aria-label={`Выбрать ${c.heading}`} />
                    </TableCell>
                    <TableCell>
                      <div className="relative w-8 aspect-[3/4] bg-muted rounded overflow-hidden">
                        {c.imagePath && (
                          <img src={`https://biglife.company24.pro/${c.imagePath}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-[220px] truncate">{c.heading}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.period || c.year}</TableCell>
                    <TableCell>
                      {c.price != null ? (
                        <span className="text-sm">
                          {c.salePrice != null ? `${c.salePrice} ₽ (было ${c.price} ₽)` : `${c.price} ₽`}
                        </span>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{c.stockQty ?? "—"}</TableCell>
                    <TableCell>
                      {soldOut ? (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive/40">нет в наличии</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">в наличии</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={c.isActive} onCheckedChange={(v) => toggleActive(c, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить обложку?</AlertDialogTitle>
                              <AlertDialogDescription>«{c.heading}» — действие необратимо. Файл изображения на диске не удаляется.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(c.id)}>Удалить</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {!loading && covers.length > 0 && view === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {covers.map((c) => {
            const soldOut = c.soldOut || (c.stockQty != null && c.stockQty <= 0)
            return (
              <Card key={c.id} className="p-4 flex gap-3">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelectOne(c.id)} aria-label={`Выбрать ${c.heading}`} />
                  <div className="relative w-20 aspect-[3/4] bg-muted rounded overflow-hidden">
                    {c.imagePath && (
                      <img src={`https://biglife.company24.pro/${c.imagePath}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {soldOut && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-[9px] text-white uppercase font-semibold text-center px-1">Нет в наличии</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{c.heading}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.period || c.year}</div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {c.price != null && (
                      <Badge variant="secondary" className="text-xs">
                        {c.salePrice != null ? `${c.salePrice} ₽ (было ${c.price} ₽)` : `${c.price} ₽`}
                      </Badge>
                    )}
                    {c.stockQty != null && <Badge variant="outline" className="text-xs">Остаток: {c.stockQty}</Badge>}
                    {!c.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">скрыта</Badge>}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={c.isActive} onCheckedChange={(v) => toggleActive(c, v)} />
                      <span className="text-xs text-muted-foreground">видна на сайте</span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить обложку?</AlertDialogTitle>
                            <AlertDialogDescription>«{c.heading}» — действие необратимо. Файл изображения на диске не удаляется.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(c.id)}>Удалить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Редактировать обложку" : "Новая обложка"}</SheetTitle>
            <SheetDescription>Изменения появятся на сайте после нажатия «Опубликовать на сайт».</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Подпись на карточке (имя героя или тема)</label>
              <Input value={form.heading} onChange={(e) => setForm(f => ({ ...f, heading: e.target.value }))} placeholder="Стас Михайлов" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Полное название (архив/поиск)</label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="BIG LIFE лето 2026 | Стас Михайлов" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Период</label>
                <Input value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} placeholder="Март-апрель 2026" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Год *</label>
                <Input value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2026" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Обложка (JPEG/PNG/WEBP, до 15MB)</label>
              <div className="flex items-center gap-3">
                {form.imagePath && (
                  <div className="relative w-14 aspect-[3/4] bg-muted rounded overflow-hidden shrink-0">
                    <img src={`https://biglife.company24.pro/${form.imagePath}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                />
              </div>
              {uploading && <p className="text-xs text-muted-foreground">Загрузка…</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Цена, ₽</label>
                <Input type="number" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} placeholder="1900" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Со скидкой, ₽</label>
                <Input type="number" value={form.salePrice} onChange={(e) => setForm(f => ({ ...f, salePrice: e.target.value }))} placeholder="1500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Остаток, шт</label>
                <Input type="number" value={form.stockQty} onChange={(e) => setForm(f => ({ ...f, stockQty: e.target.value }))} placeholder="—" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Нет в наличии</div>
                <div className="text-xs text-muted-foreground">Показывать бейдж поверх обложки, даже если остаток не 0</div>
              </div>
              <Switch checked={form.soldOut} onCheckedChange={(v) => setForm(f => ({ ...f, soldOut: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Видна на сайте</div>
                <div className="text-xs text-muted-foreground">Выключить — карточка скрывается при публикации, не удаляясь</div>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
