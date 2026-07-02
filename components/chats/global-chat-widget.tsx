"use client"

// Глобальный плавающий виджет «Чаты» (эталон UX — hh.ru).
//
// Тёмная пилюля внизу справа, ЛЕВЕЕ аватара Нэнси (nancy-assistant.tsx:
// кнопка fixed bottom-20 md:bottom-4 right-4, h-16 → центр линии на
// mobile 112px / md 48px от низа; пилюля h-12 центрируется на ту же линию).
// Красный бейдж — число тредов, ждущих ответа (99+ при переполнении).
//
// Клик — окно чатов ПОВЕРХ страницы (~85% высоты), кнопки развернуть на весь
// экран и закрыть. Внутри — общий ChatInboxPanel (тот же компонент, что таб
// «Инбокс» на вакансии).
//
// Данные бейджа — GET /api/modules/hr/inbox (лёгкая агрегирующая ручка,
// hh API не дёргает), полл раз в 60 сек + обновление из самой панели.

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare, Maximize2, Minimize2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { isOwnerEmail } from "@/lib/owner"
import { ChatInboxPanel } from "@/components/chats/chat-inbox-panel"

// ── Гейт первого этапа ──────────────────────────────────────────────────────
// Пока обкатывается — виджет виден ТОЛЬКО владельцу-полигону (isOwnerEmail).
// После визуального ОК Юрия поставить false, чтобы раскрыть всем HR компании.
const CHAT_WIDGET_OWNER_ONLY = true

const BADGE_POLL_MS = 60_000

export function GlobalChatWidget() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [unread, setUnread] = useState(0)

  // Виджет — про HR-чаты с кандидатами: показываем только в HR-модуле.
  const inHrModule = !!pathname?.startsWith("/hr")
  const allowed = inHrModule && (!CHAT_WIDGET_OWNER_ONLY || isOwnerEmail(user?.email))

  // Полл бейджа непрочитанных (и когда окно закрыто). Открытая панель сама
  // поллит список и обновляет бейдж через onThreadsLoaded — здесь только фон.
  const allowedRef = useRef(allowed)
  allowedRef.current = allowed
  const fetchUnread = useCallback(async () => {
    if (!allowedRef.current) return
    try {
      const res = await fetch("/api/modules/hr/inbox")
      if (!res.ok) return
      const data = (await res.json()) as { totalUnread?: number }
      setUnread(typeof data.totalUnread === "number" ? data.totalUnread : 0)
    } catch {
      /* фоновая проверка — молча */
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    void fetchUnread()
    const t = setInterval(() => void fetchUnread(), BADGE_POLL_MS)
    return () => clearInterval(t)
  }, [allowed, fetchUnread])

  if (!allowed) return null

  const badgeText = unread > 99 ? "99+" : String(unread)

  return (
    <>
      {/* ── Пилюля-триггер (скрыта, пока окно открыто) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            // Линия Нэнси: центр 112px (mobile) / 48px (md) от низа; пилюля h-12.
            // Нэнси right-4 + w-16 → занята полоса до 80px; пилюля right-24 = 96px.
            "fixed bottom-[88px] md:bottom-6 right-24 z-50",
            "h-12 rounded-full pl-4 pr-5 shadow-lg",
            "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
            "flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform",
          )}
          aria-label="Чаты с кандидатами"
          title="Чаты с кандидатами"
        >
          <span className="relative">
            <MessageSquare className="w-5 h-5" />
            {unread > 0 && (
              <span
                className={cn(
                  "absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full",
                  "bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center",
                )}
              >
                {badgeText}
              </span>
            )}
          </span>
          <span className="text-sm font-medium">Чаты</span>
        </button>
      )}

      {/* ── Окно чатов поверх страницы ── */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-background border shadow-2xl rounded-2xl overflow-hidden",
            "animate-in slide-in-from-bottom-4 duration-200",
            expanded
              ? "inset-4"
              : "right-4 bottom-4 h-[85vh] max-h-[calc(100vh-2rem)] w-[min(960px,calc(100vw-2rem))]",
          )}
          role="dialog"
          aria-label="Чаты с кандидатами"
        >
          {/* Шапка окна */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 shrink-0">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm font-semibold flex-1">
              Чаты
              {unread > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  непрочитанных: {badgeText}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={expanded ? "Свернуть окно" : "Развернуть на весь экран"}
              aria-label={expanded ? "Свернуть окно" : "Развернуть на весь экран"}
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Закрыть"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Тело — общий двухпанельный инбокс */}
          <div className="flex-1 min-h-0">
            <ChatInboxPanel onThreadsLoaded={setUnread} className="h-full" />
          </div>
        </div>
      )}
    </>
  )
}
