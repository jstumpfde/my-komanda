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
import { MessageSquare, Maximize2, Minimize2, X, PanelLeft, PanelRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { isOwnerEmail } from "@/lib/owner"
import { ChatInboxPanel } from "@/components/chats/chat-inbox-panel"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"

// ── Гейт первого этапа ──────────────────────────────────────────────────────
// Пока обкатывается — виджет виден ТОЛЬКО владельцу-полигону (isOwnerEmail).
// После визуального ОК Юрия поставить false, чтобы раскрыть всем HR компании.
const CHAT_WIDGET_OWNER_ONLY = true

const BADGE_POLL_MS = 60_000

// Позиция окна чата (Юрий 03.07): окно таскается мышкой за шапку в любое
// место экрана, по умолчанию открывается ПО ЦЕНТРУ. Позицию храним в
// localStorage. Кнопки в шапке — быстрые снапы к левому/правому краю.
// Когда открывается карточка кандидата (CandidateDrawer, выезжает справа),
// чат автоматом прижимается к левому краю; при закрытии возвращается.
type Pos = { x: number; y: number }
const POS_STORAGE_KEY = "chatWidgetPos"

// Фактические габариты окна (зеркалят классы w-[min(960px,…)] / h-[85vh]).
function windowSize(): { w: number; h: number } {
  const w = Math.min(960, window.innerWidth - 32)
  const h = Math.min(Math.round(window.innerHeight * 0.85), window.innerHeight - 32)
  return { w, h }
}

function clampPos(p: Pos): Pos {
  const { w, h } = windowSize()
  return {
    x: Math.min(Math.max(p.x, 8), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(p.y, 8), Math.max(8, window.innerHeight - h - 8)),
  }
}

function centerPos(): Pos {
  const { w, h } = windowSize()
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2) }
}

function readStoredPos(): Pos | null {
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Pos
    if (typeof p?.x !== "number" || typeof p?.y !== "number") return null
    return clampPos(p)
  } catch {
    return null
  }
}

export function GlobalChatWidget() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [unread, setUnread] = useState(0)
  // Позиция окна (левый верхний угол). null до первого open — центр экрана.
  const [pos, setPos] = useState<Pos | null>(null)
  // Позиция, выбранная пользователем ДО авто-прижатия влево — чтобы после
  // закрытия карточки кандидата вернуться на неё, а не прыгать.
  const userPosRef = useRef<Pos | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  // Карточка кандидата поверх чата — открывается по клику на «Открыть резюме»
  // или на имя кандидата в шапке треда (см. ChatInboxPanel onOpenCandidate).
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const setPosPersisted = useCallback((p: Pos) => {
    const clamped = clampPos(p)
    userPosRef.current = clamped
    setPos(clamped)
    try {
      window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(clamped))
    } catch {
      /* localStorage недоступен — просто не сохраняем */
    }
  }, [])

  // Открытие окна: сохранённая позиция или центр экрана (дефолт Юрия 03.07).
  const openWindow = useCallback(() => {
    const p = readStoredPos() ?? centerPos()
    userPosRef.current = p
    setPos(p)
    setOpen(true)
  }, [])

  // Перетаскивание за шапку: pointerdown на шапке (не на кнопках) → двигаем
  // окно за курсором, на pointerup фиксируем позицию в localStorage.
  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || expanded) return
    if ((e.target as HTMLElement).closest("button")) return
    const start = pos ?? centerPos()
    dragRef.current = { dx: e.clientX - start.x, dy: e.clientY - start.y }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      setPos(clampPos({ x: ev.clientX - d.dx, y: ev.clientY - d.dy }))
    }
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (d) setPosPersisted({ x: ev.clientX - d.dx, y: ev.clientY - d.dy })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    e.preventDefault()
  }, [expanded, pos, setPosPersisted])

  // Снап к краю (кнопки в шапке): держим текущую высоту, меняем только x.
  const snapTo = useCallback((side: "left" | "right") => {
    const { w } = windowSize()
    const y = (pos ?? centerPos()).y
    setPosPersisted({ x: side === "left" ? 16 : window.innerWidth - w - 16, y })
  }, [pos, setPosPersisted])

  // Авто-режим «рядом»: карточка кандидата открылась — чат прижимается влево,
  // чтобы не перекрываться с выезжающей справа карточкой. При закрытии
  // возвращаем позицию, где окно стояло у пользователя.
  useEffect(() => {
    if (drawerOpen) {
      setPos((cur) => {
        userPosRef.current = cur
        const y = (cur ?? centerPos()).y
        return clampPos({ x: 16, y })
      })
    } else if (userPosRef.current) {
      setPos(userPosRef.current)
    }
  }, [drawerOpen])

  const openCandidate = useCallback((candidateId: string) => {
    setDrawerCandidateId(candidateId)
    setDrawerOpen(true)
  }, [])

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
          onClick={openWindow}
          className={cn(
            // Линия Нэнси: центр 112px (mobile) / 48px (md) от низа; пилюля h-12.
            // Нэнси right-4 + w-16 → занята полоса до 80px; пилюля right-24 = 96px.
            // md:bottom-3 — на одной центр-линии с Нэнси (md:bottom-1, h-16):
            // виджеты прижаты к низу, чтобы не перекрывать кнопки футера
            // (Юрий 03.07); футер резервирует полосу снизу.
            "fixed bottom-[88px] md:bottom-3 right-24 z-50",
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
              : "h-[85vh] max-h-[calc(100vh-2rem)] w-[min(960px,calc(100vw-2rem))]",
          )}
          style={expanded ? undefined : { left: (pos ?? { x: 16, y: 16 }).x, top: (pos ?? { x: 16, y: 16 }).y }}
          role="dialog"
          aria-label="Чаты с кандидатами"
        >
          {/* Шапка окна — за неё окно таскается мышкой (см. onHeaderPointerDown) */}
          <div
            onPointerDown={onHeaderPointerDown}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 border-b border-border/60 shrink-0 select-none",
              !expanded && "cursor-move",
            )}
          >
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm font-semibold flex-1">
              Чаты
              {unread > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  непрочитанных: {badgeText}
                </span>
              )}
            </div>
            {!expanded && (
              <>
                <button
                  type="button"
                  onClick={() => snapTo("left")}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Прижать к левому краю"
                  aria-label="Прижать окно к левому краю"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => snapTo("right")}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Прижать к правому краю"
                  aria-label="Прижать окно к правому краю"
                >
                  <PanelRight className="w-4 h-4" />
                </button>
              </>
            )}
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
            <ChatInboxPanel
              onThreadsLoaded={setUnread}
              className="h-full"
              onOpenCandidate={openCandidate}
            />
          </div>
        </div>
      )}

      {/* Карточка кандидата поверх чата — не модальная (modal={false}),
          чтобы её оверлей не блокировал клики по окну чата, оставшемуся
          открытым слева. См. компонент CandidateDrawer — Sheet/Radix Dialog
          пробрасывает modal через ...props. */}
      <CandidateDrawer
        candidateId={drawerCandidateId}
        open={drawerOpen}
        modal={false}
        onOpenChange={(next) => {
          setDrawerOpen(next)
          if (!next) setDrawerCandidateId(null)
        }}
      />
    </>
  )
}
