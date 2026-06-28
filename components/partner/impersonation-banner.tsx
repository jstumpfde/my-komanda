"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ShieldAlert, Loader2, X } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { exitClientImpersonation } from "@/app/(partner)/partner/impersonation-actions"
import { exitAdminImpersonation } from "@/app/(admin)/admin/admin-impersonation-actions"

// Плавающий индикатор режима «Войти как клиент». Всплывает развёрнутым при входе,
// через несколько секунд сворачивается в бок (торчит краешком-ярлыком справа).
// Наведение/клик — снова разворачивает. Рендерится в шапке дашборда; в обычном
// режиме — null.
export function ImpersonationBanner() {
  const { actingAs } = useAuth()
  const { update: updateSession } = useSession()
  const [leaving, setLeaving] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Всплыли при входе → через 4с прячемся в бок.
  useEffect(() => {
    if (!actingAs) return
    autoTimer.current = setTimeout(() => setExpanded(false), 4000)
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current)
    }
  }, [actingAs])

  if (!actingAs) return null

  const cancelAuto = () => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }

  const exit = async () => {
    if (leaving) return
    setLeaving(true)
    try {
      if (actingAs?.mode === "admin") await exitAdminImpersonation()
      else await exitClientImpersonation()
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
    <div
      className="fixed right-0 top-20 z-[80] flex items-center"
      onMouseEnter={() => {
        cancelAuto()
        setExpanded(true)
      }}
    >
      {expanded ? (
        <div className="flex items-center gap-2 rounded-l-xl bg-indigo-600 py-2 pl-3 pr-3 text-sm text-white shadow-lg">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="max-w-[200px] truncate">
            Режим клиента: <strong>{actingAs.clientName}</strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-white bg-white text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 hover:border-indigo-100"
            onClick={() => void exit()}
            disabled={leaving}
          >
            {leaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeft className="h-3 w-3" />}
            Выйти
          </Button>
          <button
            type="button"
            aria-label="Свернуть"
            className="ml-0.5 rounded p-0.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            onClick={() => setExpanded(false)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Режим клиента: ${actingAs.clientName}. Развернуть`}
          title={`Режим клиента: ${actingAs.clientName}`}
          className="flex items-center rounded-l-lg bg-indigo-600 py-2 pl-2 pr-1 text-white shadow-lg transition-all hover:pr-2"
          onClick={() => {
            cancelAuto()
            setExpanded(true)
          }}
        >
          <ShieldAlert className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
