"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ShieldAlert, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { exitClientImpersonation } from "@/app/(partner)/partner/impersonation-actions"

// Постоянная плашка сверху, когда партнёр в режиме «Войти как клиент».
// Рендерится в шапке дашборда (DashboardHeader). В обычном режиме — null.
export function ImpersonationBanner() {
  const { actingAs } = useAuth()
  const { update: updateSession } = useSession()
  const [leaving, setLeaving] = useState(false)

  if (!actingAs) return null

  const exit = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      await exitClientImpersonation()
      await updateSession({})
    } catch (e) {
      // NEXT_REDIRECT — штатный сигнал редиректа из server-action.
      const digest = (e as { digest?: string } | null)?.digest
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        await updateSession({}).catch(() => {})
        throw e
      }
      setLeaving(false)
    }
  }

  return (
    <div className="bg-indigo-600 text-white px-4 py-1.5 flex items-center justify-between gap-2 text-sm">
      <span className="font-medium flex items-center gap-1.5 min-w-0">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Вы помогаете клиенту <strong>{actingAs.clientName}</strong>
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs bg-white/90 border-indigo-300 text-indigo-900 hover:bg-white gap-1 shrink-0"
        onClick={() => void exit()}
        disabled={leaving}
      >
        {leaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeft className="w-3 h-3" />}
        Вернуться в кабинет
      </Button>
    </div>
  )
}
