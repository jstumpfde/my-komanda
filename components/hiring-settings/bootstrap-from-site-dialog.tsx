"use client"

// Фаза 1 онбординга: «Заполнить из сайта». Вводишь адрес сайта клиента →
// AI извлекает описание компании + продукты → РЕВЬЮ (правишь описание, видишь
// список продуктов) → «Применить» сохраняет в компанию. Дальше — донастройка
// в карточке компании. Человек всегда проверяет перед сохранением.

import { useState } from "react"
import { Sparkles, Loader2, Globe, AlertTriangle, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { ProductProfile } from "@/lib/hiring/product-profile"

type Extracted = { companyDescription: string; products: ProductProfile[]; pages: string[] }

export function BootstrapFromSiteDialog({ open, onOpenChange, hasExistingProducts, onPatch, onApplied }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  hasExistingProducts: boolean
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
  onApplied: () => void
}) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<Extracted | null>(null)
  const [desc, setDesc] = useState("")

  const reset = () => { setResult(null); setDesc(""); setLoading(false); setApplying(false) }

  const extract = async () => {
    setLoading(true); setResult(null)
    try {
      const res = await fetch("/api/modules/hr/company/bootstrap-from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "Не удалось обработать сайт"); return }
      setResult({ companyDescription: data.companyDescription ?? "", products: data.products ?? [], pages: data.pages ?? [] })
      setDesc(data.companyDescription ?? "")
    } catch { toast.error("Ошибка запроса") }
    finally { setLoading(false) }
  }

  const apply = async () => {
    if (!result) return
    setApplying(true)
    try {
      // Описание компании → /api/companies
      if (desc.trim()) {
        await fetch("/api/companies", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_description: desc.trim() }),
        })
      }
      // Продукты → hiring_defaults (заменяют текущие продукты основной компании)
      if (result.products.length) {
        await onPatch({ productProfiles: result.products, defaultProductProfileId: result.products[0].id })
      }
      toast.success("Профиль заполнен из сайта — проверьте и при необходимости поправьте")
      onApplied()
      onOpenChange(false)
      reset()
    } catch { toast.error("Не удалось применить") }
    finally { setApplying(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Заполнить из сайта</DialogTitle>
          <DialogDescription>Прочитаем сайт клиента и предложим описание компании и продукты. Вы проверите перед сохранением.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Адрес сайта клиента</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !loading) extract() }}
                  placeholder="company.ru"
                  className="pl-8"
                />
              </div>
              <Button onClick={extract} disabled={loading || !url.trim()} className="gap-1.5 shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Извлечь
              </Button>
            </div>
            {loading && <p className="text-[11px] text-muted-foreground">Читаем сайт и анализируем… до ~30 сек.</p>}
          </div>

          {result && (
            <div className="space-y-3 border-t pt-3">
              {result.pages.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Прочитано страниц: {result.pages.length}</p>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Описание компании (для кандидатов)</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-[90px] text-sm" placeholder="AI не нашёл описание — впишите вручную" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Продукты ({result.products.length})</Label>
                {result.products.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">Продукты не распознаны — добавите вручную после применения.</p>
                ) : (
                  <div className="space-y-1.5">
                    {result.products.map((p, i) => (
                      <div key={p.id} className="rounded-md border bg-muted/20 px-2.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-sm font-medium truncate">{p.name || `Продукт ${i + 1}`}</span>
                          {p.salesType && <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5 shrink-0">{p.salesType}</span>}
                        </div>
                        {p.productDescription && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{p.productDescription}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hasExistingProducts && result.products.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Применение заменит текущие продукты основной компании.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset() }} disabled={applying}>Отмена</Button>
          {result && (
            <Button onClick={apply} disabled={applying} className="gap-1.5">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Применить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
