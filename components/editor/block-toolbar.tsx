"use client"

import { useEffect, useState } from "react"
import { toolbarColors, type ToolbarBlockType } from "./theme-colors"
import type { BlockType } from "./types"

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function IconText({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M8 4h2.5v16H8V4zm5.5 5.5h3V20h-3V9.5z" fill={color} />
      <path d="M4 20h16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconImage({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth="1.3" />
      <path d="M7 16l4-5 3 3 2.5-3L20 16" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="9" r="1.8" fill={color} />
    </svg>
  )
}

function IconVideo({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth="1.3" />
      <path d="M9.5 8v8l7-4z" fill={color} />
    </svg>
  )
}

function IconAudio({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="8" y="2" width="8" height="12" rx="4" stroke={color} strokeWidth="1.3" />
      <path d="M5 11a7 7 0 0014 0" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12 18v4M9 22h6" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function IconFile({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M13 2H7a2.5 2.5 0 00-2.5 2.5v15A2.5 2.5 0 007 22h10a2.5 2.5 0 002.5-2.5V8.5L13 2z" stroke={color} strokeWidth="1.3" />
      <path d="M13 2v7h6.5" stroke={color} strokeWidth="1.3" />
    </svg>
  )
}

function IconInfo({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.3" />
      <path d="M12 8v5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" fill={color} />
    </svg>
  )
}

function IconTest({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke={color} strokeWidth="1.3" />
      <path d="M8 12l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTask({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l3 6.5h6.5l-5.2 4 2 6.5L12 15.5 5.7 19l2-6.5L2.5 8.5H9z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// ─── Button config ───────────────────────────────────────────────────────────

const TOOLBAR_BUTTONS: {
  type: ToolbarBlockType
  blockType: BlockType
  label: string
  Icon: React.ComponentType<{ color: string }>
}[] = [
  { type: "text",  blockType: "text",  label: "Текст",    Icon: IconText },
  { type: "image", blockType: "image", label: "Фото",     Icon: IconImage },
  { type: "video", blockType: "video", label: "Видео",    Icon: IconVideo },
  { type: "audio", blockType: "audio", label: "Аудио",    Icon: IconAudio },
  { type: "file",  blockType: "file",  label: "Файл",     Icon: IconFile },
  { type: "info",  blockType: "info",  label: "Инфо",     Icon: IconInfo },
  { type: "test",  blockType: "test",  label: "Тест",     Icon: IconTest },
  { type: "task",  blockType: "task",  label: "Задание",  Icon: IconTask },
]

// ─── Component ───────────────────────────────────────────────────────────────

interface BlockToolbarProps {
  onAddBlock: (type: BlockType) => void
  allowedTypes?: BlockType[]
}

export function BlockToolbar({ onAddBlock, allowedTypes }: BlockToolbarProps) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  const theme = isDark ? "dark" : "light"

  const buttons = allowedTypes
    ? TOOLBAR_BUTTONS.filter((b) => allowedTypes.includes(b.blockType))
    : TOOLBAR_BUTTONS

  return (
    <div
      className="inline-flex items-center gap-[3px] rounded-[10px] border border-border/50 bg-card px-1.5 py-[5px]"
    >
      {buttons.map(({ type, blockType, label, Icon }) => {
        const colors = toolbarColors[type][theme]
        return (
          <button
            key={type}
            type="button"
            onClick={() => onAddBlock(blockType)}
            className="flex flex-col items-center gap-[2px] rounded-lg px-2.5 py-1.5 cursor-pointer transition-transform hover:scale-[1.06] active:scale-95"
            style={{ backgroundColor: colors.bg }}
          >
            <Icon color={colors.icon} />
            <span className="text-[10px] font-medium leading-tight" style={{ color: colors.icon }}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
