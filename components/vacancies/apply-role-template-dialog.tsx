"use client"

// ТЗ №3: диалог применения шаблона роли к вакансии. Выбор шаблона + продукта,
// предупреждение о перезаписи, атомарное применение через POST.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Sparkles, AlertTriangle, Package } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

type Tmpl = { id: string; name: string; slug: string | null; roleCategory: string | null; isSystem: boolean | null }
type Prod = { id: string; name: string }

export function ApplyRoleTemplateDialog({ vacancyId, open, onOpenChange, onApplied }: {
  vacancyId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onApplied: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Tmpl[]>([])
  const [products, setProducts] = useState<Prod[]>([])
  const [roleTemplateId, setRoleTemplateId] = useState("")
  const [productProfileId, setProductProfileId] = useState("")
  const [applying, setApplying] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true); setNeedsConfirm(false)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/apply-role-template`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { templates: Tmpl[]; products: Prod[]; defaultProductProfileId: string }) => {
        setTemplates(d.templates ?? [])
        setProducts(d.products ?? [])
        setRoleTemplateId(d.templates?.[0]?.id ?? "")
        setProductProfileId(d.defaultProductProfileId || d.products?.[0]?.id || "")
      })
      .catch(() => toast.error("Не удалось загрузить шаблоны"))
      .finally(() => setLoading(false))
  }, [open, vacancyId])

  const apply = async (overwrite: boolean) => {
    if (!roleTemplateId) return
    setApplying(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/apply-role-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleTemplateId, productProfileId: productProfileId || undefined, overwrite }),
      })
      if (res.status === 409) { setNeedsConfirm(true); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "Не удалось применить шаблон"); return }
      toast.success("Шаблон применён: анкета, Портрет, воронка и демо заполнены")
      onApplied()
      onOpenChange(false)
    } catch { toast.error("Ошибка применения") }
    finally { setApplying(false) }
  }

  const noProducts = !loading && products.length === 0
  const noTemplates = !loading && templates.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Применить шаблон роли</DialogTitle>
          <DialogDescription>Заполнит анкету, Портрет, воронку и демо готовым контентом и подставит данные продукта.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : noProducts ? (
          <div className="py-4 text-sm space-y-3">
            <p className="flex items-start gap-2 text-muted-foreground"><Package className="w-4 h-4 mt-0.5 shrink-0" /> Сначала заполните профиль продукта — он подставляется в анкету, демо и критерии.</p>
            <Button asChild variant="outline" size="sm"><Link href="/hr/hiring-settings?tab=companies">Перейти к профилю продукта</Link></Button>
          </div>
        ) : noTemplates ? (
          <p className="py-4 text-sm text-muted-foreground">Нет доступных шаблонов ролей.</p>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Шаблон роли</Label>
              <Select value={roleTemplateId} onValueChange={setRoleTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.isSystem ? " · системный" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {products.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Продукт</Label>
                <Select value={productProfileId} onValueChange={setProductProfileId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsConfirm && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>В вакансии уже есть контент (анкета/Портрет/воронка/демо). Применение перезапишет его. Кандидаты не затрагиваются.</span>
              </div>
            )}
          </div>
        )}

        {!loading && !noProducts && !noTemplates && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Отмена</Button>
            <Button onClick={() => apply(needsConfirm)} disabled={applying || !roleTemplateId} className="gap-1.5">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {needsConfirm ? "Перезаписать" : "Применить"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
