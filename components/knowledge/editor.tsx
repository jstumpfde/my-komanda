"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link2, Code,
  ImageIcon, Minus, Quote, Undo2, Redo2,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface KnowledgeEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
}

// ─── Toolbar button ─────────────────────────────────────────────────────────

function ToolbarBtn({
  icon: Icon, title, onClick, active,
}: {
  icon: React.ElementType; title: string; onClick: () => void; active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={cn(
        "p-1.5 rounded hover:bg-muted transition-colors",
        active && "bg-muted text-primary",
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

function ToolbarSep() {
  return <div className="w-px h-5 bg-border mx-0.5" />
}

// ─── Visual editor ──────────────────────────────────────────────────────────

function VisualEditor({ value, onChange, placeholder, minHeight = 400 }: KnowledgeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalUpdate = useRef(false)

  // Sync value → DOM only on initial mount or external changes
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      const html = markdownToHtml(value)
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html
      }
    }
    isInternalUpdate.current = false
  }, [value])

  const exec = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
    syncToParent()
  }, [])

  const syncToParent = useCallback(() => {
    if (!editorRef.current) return
    isInternalUpdate.current = true
    onChange(htmlToMarkdown(editorRef.current.innerHTML))
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === "b") { e.preventDefault(); exec("bold") }
      if (e.key === "i") { e.preventDefault(); exec("italic") }
      if (e.key === "u") { e.preventDefault(); exec("underline") }
    }
  }, [exec])

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 flex-wrap">
        <ToolbarBtn icon={Bold} title="Жирный (Ctrl+B)" onClick={() => exec("bold")} />
        <ToolbarBtn icon={Italic} title="Курсив (Ctrl+I)" onClick={() => exec("italic")} />
        <ToolbarBtn icon={Underline} title="Подчёркнутый (Ctrl+U)" onClick={() => exec("underline")} />
        <ToolbarBtn icon={Strikethrough} title="Зачёркнутый" onClick={() => exec("strikethrough")} />
        <ToolbarSep />
        <ToolbarBtn icon={Heading1} title="Заголовок 1" onClick={() => exec("formatBlock", "h1")} />
        <ToolbarBtn icon={Heading2} title="Заголовок 2" onClick={() => exec("formatBlock", "h2")} />
        <ToolbarBtn icon={Heading3} title="Заголовок 3" onClick={() => exec("formatBlock", "h3")} />
        <ToolbarSep />
        <ToolbarBtn icon={List} title="Маркированный список" onClick={() => exec("insertUnorderedList")} />
        <ToolbarBtn icon={ListOrdered} title="Нумерованный список" onClick={() => exec("insertOrderedList")} />
        <ToolbarSep />
        <ToolbarBtn icon={AlignLeft} title="По левому краю" onClick={() => exec("justifyLeft")} />
        <ToolbarBtn icon={AlignCenter} title="По центру" onClick={() => exec("justifyCenter")} />
        <ToolbarBtn icon={AlignRight} title="По правому краю" onClick={() => exec("justifyRight")} />
        <ToolbarSep />
        <ToolbarBtn icon={Quote} title="Цитата" onClick={() => exec("formatBlock", "blockquote")} />
        <ToolbarBtn icon={Code} title="Код" onClick={() => {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            const code = document.createElement("code")
            code.className = "bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
            range.surroundContents(code)
            syncToParent()
          }
        }} />
        <ToolbarBtn icon={Minus} title="Горизонтальная линия" onClick={() => exec("insertHorizontalRule")} />
        <ToolbarBtn icon={Link2} title="Ссылка" onClick={() => {
          const url = prompt("Введите URL:")
          if (url) exec("createLink", url)
        }} />
        <ToolbarSep />
        <ToolbarBtn icon={Undo2} title="Отменить" onClick={() => exec("undo")} />
        <ToolbarBtn icon={Redo2} title="Повторить" onClick={() => exec("redo")} />
      </div>

      {/* Content area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncToParent}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder || "Начните писать..."}
        className={cn(
          "px-6 py-4 outline-none text-sm leading-relaxed",
          "prose prose-sm max-w-none",
          "[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3",
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
          "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_a]:text-primary [&_a]:underline",
          "[&_hr]:my-4 [&_hr]:border-border",
        )}
        style={{ minHeight }}
      />
    </div>
  )
}

// ─── Markdown ↔ HTML converters (simple) ────────────────────────────────────

function markdownToHtml(md: string): string {
  if (!md.trim()) return ""
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^---$/gm, "<hr>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>")
}

function htmlToMarkdown(html: string): string {
  if (!html.trim()) return ""
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<del>(.*?)<\/del>/gi, "~~$1~~")
    .replace(/<s>(.*?)<\/s>/gi, "~~$1~~")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n\n")
    .replace(/<hr[^>]*>/gi, "---\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?[uo]l[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div>/gi, "\n")
    .replace(/<\/div>/gi, "")
    .replace(/<\/?p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ─── Main component with tabs ───────────────────────────────────────────────

export function KnowledgeEditor({ value, onChange, placeholder, minHeight = 400 }: KnowledgeEditorProps) {
  const [tab, setTab] = useState<"visual" | "markdown">("visual")

  return (
    <div className="space-y-2">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab("visual")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            tab === "visual" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Редактор
        </button>
        <button
          type="button"
          onClick={() => setTab("markdown")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            tab === "markdown" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Markdown
        </button>
      </div>

      {/* Content */}
      {tab === "visual" ? (
        <VisualEditor value={value} onChange={onChange} placeholder={placeholder} minHeight={minHeight} />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Напишите содержимое статьи в формате Markdown..."}
          rows={Math.max(16, Math.ceil(minHeight / 24))}
          className="font-mono text-sm"
        />
      )}
    </div>
  )
}
