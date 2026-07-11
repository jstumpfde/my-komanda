"use client"

// Глоссарий названий — правильные написания продуктов/терминов для AI-анализатора
// (rop_settings.glossary, свободный текст).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export function GlossaryCard({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function save() {
    setBusy(true); setSaved(false)
    try {
      await fetch("/api/modules/ai-rop/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glossary: value }),
      })
      setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="size-4 text-violet-600" /> Глоссарий названий</CardTitle>
        <CardDescription>Правильные написания продуктов/терминов компании — AI будет ориентироваться на них при разборе.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5} placeholder={"Например:\nМП = металлопрокат\nМК = металлоконструкции"} className="text-sm" />
        <div className="flex justify-end gap-2">
          {saved && <span className="self-center text-xs text-emerald-600">Сохранено</span>}
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
