"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Lock, ChevronRight, ArrowLeft } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const CREATE_ROLES = ["platform_admin", "platform_manager", "director", "hr_lead", "hr_manager"]

// Compact emoji grid for the custom-type picker
const EMOJI_OPTIONS = [
  "📦","📋","📄","📑","📚","📖","📝","📌","📎","📁",
  "📂","🗂","🗃","🗄","📊","📈","📉","💼","🗒","🗓",
  "📆","🗞","📰","📃","🧾","🗳","📬","📮","💡","⚡",
  "🔥","✨","🎯","🏆","🎖","🥇","🏅","🎁","🎀","🎈",
  "👋","🙋","🤝","👥","👤","🧑","👨","👩","🧑‍💼","🧑‍🏫",
  "🎓","🎒","✏️","📐","📏","🔍","🔎","🔑","🔐","🛠",
  "⚙️","🧰","🔧","🔨","🧪","🧬","💻","🖥","⌨️","🖱",
  "📱","☎️","📞","✉️","📧","💬","🗨","📢","📣","🔔",
  "🌟","⭐","💯","✅","☑️","✔️","❓","❗","ℹ️","⚠️",
]

interface TypePill {
  emoji: string
  title: string
  href: string | null
}

interface Group {
  emoji: string
  label: string
  items: TypePill[]
}

const DEFAULT_GROUPS: Group[] = [
  {
    emoji: "👥",
    label: "Найм, адаптация и обучение",
    items: [
      { emoji: "👋", title: "Презентация должности", href: "/knowledge-v2/create/demo" },
      { emoji: "🚀", title: "Онбординг",             href: null },
      { emoji: "🎓", title: "Обучающий курс",        href: null },
      { emoji: "🎬", title: "Видеоурок",             href: null },
      { emoji: "📝", title: "Скрипт",                href: null },
      { emoji: "🎯", title: "Аттестация",            href: null },
      { emoji: "📊", title: "Оценка 360°",           href: null },
    ],
  },
  {
    emoji: "📋",
    label: "Документы",
    items: [
      { emoji: "📋", title: "Регламент",     href: null },
      { emoji: "📄", title: "Инструкция",    href: null },
      { emoji: "📑", title: "Шаблон",        href: null },
      { emoji: "💼", title: "Должностная",   href: null },
    ],
  },
  {
    emoji: "📚",
    label: "Знания",
    items: [
      { emoji: "📚", title: "Статья",     href: "/knowledge-v2/create/article" },
      { emoji: "💡", title: "Кейс",       href: null },
      { emoji: "🎬", title: "Видеообзор", href: null },
      { emoji: "❓", title: "FAQ",        href: null },
      { emoji: "📖", title: "Wiki",       href: null },
    ],
  },
  {
    emoji: "🤝",
    label: "Для клиентов",
    items: [
      { emoji: "📘", title: "Руководство",       href: null },
      { emoji: "🛠", title: "Решение проблем",   href: null },
      { emoji: "📦", title: "Продукт",           href: null },
      { emoji: "🎥", title: "Видео",             href: null },
    ],
  },
]

// ─── Building blocks row (mirrors NotionEditor toolbar) ───────────────────

// Mirrors NotionEditor's TOOLBAR_BLOCK_ITEMS (components/vacancies/notion-editor.tsx)
// to keep the visual language 1:1 with what users see when editing a material.
interface ToolbarBlock {
  label: string
  light: { bg: string; icon: string }
  dark: { bg: string; icon: string }
  svg: (c: string) => React.ReactNode
}

const TOOLBAR_BLOCKS: ToolbarBlock[] = [
  {
    label: "Текст",
    light: { bg: "#EEEDFE", icon: "#534AB7" }, dark: { bg: "#1e1e2a", icon: "#AFA9EC" },
    svg: (c) => <><path d="M8 4h2.5v16H8V4zm5.5 5.5h3V20h-3V9.5z" fill={c}/><path d="M4 20h16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></>,
  },
  {
    label: "Фото",
    light: { bg: "#FBEAF0", icon: "#993556" }, dark: { bg: "#1a1524", icon: "#ED93B1" },
    svg: (c) => <><rect x="2" y="4" width="20" height="16" rx="3" stroke={c} strokeWidth="1.3"/><path d="M7 16l4-5 3 3 2.5-3L20 16" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8.5" cy="9" r="1.8" fill={c}/></>,
  },
  {
    label: "Видео",
    light: { bg: "#FAECE7", icon: "#993C1D" }, dark: { bg: "#1f1218", icon: "#F09595" },
    svg: (c) => <><rect x="2" y="4" width="20" height="16" rx="3" stroke={c} strokeWidth="1.3"/><path d="M9.5 8v8l7-4z" fill={c}/></>,
  },
  {
    label: "Аудио",
    light: { bg: "#E1F5EE", icon: "#0F6E56" }, dark: { bg: "#0f2018", icon: "#5DCAA5" },
    svg: (c) => <><rect x="8" y="2" width="8" height="12" rx="4" stroke={c} strokeWidth="1.3"/><path d="M5 11a7 7 0 0014 0" stroke={c} strokeWidth="1.3" strokeLinecap="round"/><path d="M12 18v4M9 22h6" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></>,
  },
  {
    label: "Файл",
    light: { bg: "#E6F1FB", icon: "#185FA5" }, dark: { bg: "#1a1e28", icon: "#85B7EB" },
    svg: (c) => <><path d="M13 2H7a2.5 2.5 0 00-2.5 2.5v15A2.5 2.5 0 007 22h10a2.5 2.5 0 002.5-2.5V8.5L13 2z" stroke={c} strokeWidth="1.3"/><path d="M13 2v7h6.5" stroke={c} strokeWidth="1.3"/></>,
  },
  {
    label: "Инфо",
    light: { bg: "#EFF6FF", icon: "#2563EB" }, dark: { bg: "#172030", icon: "#60A5FA" },
    svg: (c) => <><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.3"/><path d="M12 8v5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="16.5" r="1" fill={c}/></>,
  },
  {
    label: "Тест",
    light: { bg: "#EAF3DE", icon: "#3B6D11" }, dark: { bg: "#0f2418", icon: "#4ADE80" },
    svg: (c) => <><rect x="3" y="3" width="18" height="18" rx="4" stroke={c} strokeWidth="1.3"/><path d="M8 12l3 3 5-5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></>,
  },
  {
    label: "Задание",
    light: { bg: "#FAEEDA", icon: "#854F0B" }, dark: { bg: "#1f1a0e", icon: "#FBBF24" },
    svg: (c) => <path d="M12 2l3 6.5h6.5l-5.2 4 2 6.5L12 15.5 5.7 19l2-6.5L2.5 8.5H9z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" fill="none"/>,
  },
]

function useIsDark() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function BlockTypesRow() {
  const isDark = useIsDark()
  return (
    <div className="mb-8">
      <div className="flex items-center gap-4">
        <span className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-[18px] shrink-0">
          {TOOLBAR_BLOCKS.map((b) => {
            const colors = isDark ? b.dark : b.light
            return (
              <div key={b.label} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-[72px] h-[72px] rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: colors.bg,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    {b.svg(colors.icon)}
                  </svg>
                </div>
                <span className="text-xs font-medium text-foreground">{b.label}</span>
              </div>
            )
          })}
        </div>
        <span className="flex-1 h-px bg-border" />
      </div>
    </div>
  )
}

// ─── Pill ─────────────────────────────────────────────────────────────────

function Pill({ item }: { item: TypePill }) {
  const disabled = item.href === null
  const body = (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 px-5 py-[18px] rounded-xl border border-border bg-card transition",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:border-primary hover:shadow-sm",
      )}
    >
      <span className="text-xl leading-none">{item.emoji}</span>
      <span className="text-sm font-medium">{item.title}</span>
      {disabled && (
        <span className="ml-1 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
          Скоро
        </span>
      )}
    </div>
  )
  return disabled ? body : <Link href={item.href!}>{body}</Link>
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeV2CreatePage() {
  const { role } = useAuth()
  const canCreate = CREATE_ROLES.includes(role)

  // Local editable groups so custom types added via the modal show up on this
  // page until reload. Persistence is a follow-up task.
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS)

  // Custom-type modal state
  const [customOpen, setCustomOpen] = useState(false)
  const [customStep, setCustomStep] = useState<1 | 2>(1)
  const [targetKind, setTargetKind] = useState<"existing" | "new">("existing")
  const [existingLabel, setExistingLabel] = useState(DEFAULT_GROUPS[0].label)
  const [newSectionEmoji, setNewSectionEmoji] = useState("📁")
  const [newSectionLabel, setNewSectionLabel] = useState("")
  const [newTypeEmoji, setNewTypeEmoji] = useState("📦")
  const [newTypeName, setNewTypeName] = useState("")
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)

  const resetCustom = () => {
    setCustomStep(1)
    setTargetKind("existing")
    setExistingLabel(groups[0]?.label ?? DEFAULT_GROUPS[0].label)
    setNewSectionEmoji("📁")
    setNewSectionLabel("")
    setNewTypeEmoji("📦")
    setNewTypeName("")
  }

  const openCustom = () => {
    resetCustom()
    setCustomOpen(true)
  }

  // Open the modal already scoped to a specific category and jump to step 2.
  const openCustomForCategory = (label: string) => {
    resetCustom()
    setTargetKind("existing")
    setExistingLabel(label)
    setCustomStep(2)
    setCustomOpen(true)
  }

  const step1Valid = targetKind === "existing"
    ? !!existingLabel
    : !!newSectionLabel.trim() && !!newSectionEmoji.trim()

  const step2Valid = !!newTypeName.trim() && !!newTypeEmoji.trim()

  const handleSaveCustom = () => {
    if (!step2Valid) return
    const typePill: TypePill = {
      emoji: newTypeEmoji.trim() || "📦",
      title: newTypeName.trim(),
      href: null,
    }

    if (targetKind === "existing") {
      setGroups((prev) =>
        prev.map((g) =>
          g.label === existingLabel ? { ...g, items: [...g.items, typePill] } : g,
        ),
      )
    } else {
      const label = newSectionLabel.trim()
      const sectionEmoji = newSectionEmoji.trim() || "📁"
      setGroups((prev) => [
        ...prev,
        { emoji: sectionEmoji, label, items: [typePill] },
      ])
    }

    setCustomOpen(false)
    resetCustom()
  }

  if (!canCreate) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <div className="max-w-xl mx-auto mt-12">
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h1 className="text-lg font-semibold mb-2">Недостаточно прав</h1>
                  <p className="text-sm text-muted-foreground mb-5">
                    Создавать материалы могут только директор, главный HR и HR-менеджер.
                  </p>
                  <Button asChild variant="outline">
                    <Link href="/knowledge-v2">Вернуться к материалам</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-5xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Создать корпоративный материал</h1>
              </div>

              {/* Building-blocks preview row */}
              <BlockTypesRow />

              <div className="space-y-6">
                {groups.map((group) => (
                  <section key={group.label}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl leading-none">{group.emoji}</span>
                      <span className="text-base font-semibold">{group.label}</span>
                      <span className="flex-1 h-px bg-border" />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {group.items.map((item) => (
                        <Pill key={`${group.label}-${item.title}`} item={item} />
                      ))}
                      <button
                        type="button"
                        onClick={() => openCustomForCategory(group.label)}
                        title="Добавить тип в этот раздел"
                        className="h-[56px] w-[56px] rounded-xl bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground hover:bg-muted hover:border-primary/40 hover:text-foreground cursor-pointer transition"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </section>
                ))}

                <button
                  type="button"
                  onClick={openCustom}
                  className="w-full flex items-center justify-center gap-2 py-5 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer transition"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">Добавить свой тип материала</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Custom type dialog */}
      <Dialog
        open={customOpen}
        onOpenChange={(open) => {
          setCustomOpen(open)
          if (!open) resetCustom()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {customStep === 1 ? "Куда добавить тип" : "Название и иконка"}
            </DialogTitle>
          </DialogHeader>

          {customStep === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Выберите существующий раздел или создайте новый.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetKind("existing")}
                  className={cn(
                    "rounded-lg p-3 text-left transition border",
                    targetKind === "existing"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="text-sm font-semibold">В существующий</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Выбрать раздел</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetKind("new")}
                  className={cn(
                    "rounded-lg p-3 text-left transition border",
                    targetKind === "new"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="text-sm font-semibold">В новый раздел</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Иконка + название</div>
                </button>
              </div>

              {targetKind === "existing" && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
                    Раздел
                  </label>
                  <select
                    value={existingLabel}
                    onChange={(e) => setExistingLabel(e.target.value)}
                    className="h-10 w-full px-3 rounded-md border border-border bg-background text-sm"
                  >
                    {groups.map((g) => (
                      <option key={g.label} value={g.label}>
                        {g.emoji} {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetKind === "new" && (
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Эмодзи</label>
                    <Input
                      value={newSectionEmoji}
                      onChange={(e) => setNewSectionEmoji(e.target.value.slice(0, 4))}
                      placeholder="📁"
                      className="h-10 text-center text-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Название раздела</label>
                    <Input
                      value={newSectionLabel}
                      onChange={(e) => setNewSectionLabel(e.target.value.slice(0, 40))}
                      placeholder="Например: HR-политики"
                      className="h-10"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCustomOpen(false)}>Отмена</Button>
                <Button onClick={() => setCustomStep(2)} disabled={!step1Valid} className="gap-1.5">
                  Далее
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {customStep === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Укажите иконку и название нового типа.
              </p>

              {/* Category selector — lets the user switch target without going back */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Категория</label>
                <select
                  value={targetKind === "new" ? "__new__" : existingLabel}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setTargetKind("new")
                    } else {
                      setTargetKind("existing")
                      setExistingLabel(e.target.value)
                    }
                  }}
                  className="h-10 w-full px-3 rounded-md border border-border bg-background text-sm"
                >
                  {groups.map((g) => (
                    <option key={g.label} value={g.label}>
                      {g.emoji} {g.label}
                    </option>
                  ))}
                  {targetKind === "new" && newSectionLabel.trim() && (
                    <option value="__new__">
                      ➕ Новый раздел: {newSectionEmoji} {newSectionLabel}
                    </option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-[72px_1fr] gap-3">
                {/* Emoji picker trigger */}
                <div className="relative">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Иконка</label>
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen((v) => !v)}
                    className="h-10 w-full rounded-md border border-border bg-background text-2xl flex items-center justify-center hover:border-primary/50 transition"
                  >
                    {newTypeEmoji || "📦"}
                  </button>
                  {emojiPickerOpen && (
                    <>
                      {/* Backdrop to close on outside click */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setEmojiPickerOpen(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 z-50 w-[300px] bg-popover border border-border rounded-xl shadow-xl p-2">
                        <div className="grid grid-cols-9 gap-0.5 max-h-[240px] overflow-y-auto">
                          {EMOJI_OPTIONS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              onClick={() => {
                                setNewTypeEmoji(em)
                                setEmojiPickerOpen(false)
                              }}
                              className="w-[30px] h-[30px] text-lg flex items-center justify-center rounded hover:bg-muted transition-colors leading-none"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">Название</label>
                  <Input
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value.slice(0, 40))}
                    placeholder="Например: Чек-лист"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Live preview */}
              {(newTypeName.trim() || newTypeEmoji.trim()) && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Предпросмотр</p>
                  <div className="inline-flex items-center gap-2.5 px-5 py-[18px] rounded-xl border border-border bg-card">
                    <span className="text-xl leading-none">{newTypeEmoji || "📦"}</span>
                    <span className="text-sm font-medium">{newTypeName.trim() || "Название"}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setCustomStep(1)} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" />
                  Назад
                </Button>
                <Button onClick={handleSaveCustom} disabled={!step2Valid}>
                  Добавить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
