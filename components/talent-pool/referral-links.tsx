"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Copy, Link } from "lucide-react"

const REFERRAL_LINKS = [
  { name: "Анна Иванова", url: "company24.pro/ref/anna-ivanova", clicks: 34, referred: 5, hired: 2 },
  { name: "Дмитрий Козлов", url: "company24.pro/ref/dmitry-kozlov", clicks: 21, referred: 4, hired: 1 },
  { name: "Мария Сидорова", url: "company24.pro/ref/maria-sidorova", clicks: 15, referred: 3, hired: 0 },
]

export function ReferralLinks() {
  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(`https://${url}`)
    toast.success("Ссылка скопирована")
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Link className="w-4 h-4 text-purple-600" />
          Ссылки сотрудников
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Сотрудник</th>
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Ссылка</th>
              <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Переходов</th>
              <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Привёл</th>
              <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Нанято</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {REFERRAL_LINKS.map((r) => (
              <tr key={r.name} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5 text-[13px] font-medium">{r.name}</td>
                <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{r.url}</td>
                <td className="px-4 py-2.5 text-xs text-center">{r.clicks}</td>
                <td className="px-4 py-2.5 text-xs text-center font-medium">{r.referred}</td>
                <td className="px-4 py-2.5 text-xs text-center font-semibold text-emerald-600">{r.hired}</td>
                <td className="px-4 py-2.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(r.url)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
