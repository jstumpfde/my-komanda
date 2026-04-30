"use client"

import { useEffect, useState, useCallback } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import LinkExtension from "@tiptap/extension-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, Link2Off,
  Undo, Redo, Loader2, Save,
} from "lucide-react"

interface LegalDoc {
  title: string
  content_html: string
  updated_at: string | null
}

interface Props {
  slug: string
}

export function LegalEditor({ slug }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-gray max-w-none focus:outline-none min-h-[420px] px-5 py-4",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3",
          "[&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
          "[&_p]:mb-3",
          "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ul]:space-y-1",
          "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3 [&_ol]:space-y-1",
          "[&_strong]:font-semibold",
          "[&_a]:text-primary [&_a]:underline",
          "[&_hr]:my-6 [&_hr]:border-border",
        ),
      },
    },
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/legal/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LegalDoc>
      })
      .then((doc) => {
        if (cancelled) return
        setTitle(doc.title)
        setUpdatedAt(doc.updated_at)
        editor?.commands.setContent(doc.content_html, false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(`Не удалось загрузить документ: ${err.message}`)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [slug, editor])

  const handleSave = useCallback(async () => {
    if (!editor) return
    if (!title.trim()) {
      toast.error("Заголовок не может быть пустым")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/legal/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content_html: editor.getHTML(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const doc = await res.json() as LegalDoc
      setUpdatedAt(doc.updated_at)
      toast.success("Документ сохранён")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "неизвестная ошибка"
      toast.error(`Не удалось сохранить: ${msg}`)
    } finally {
      setSaving(false)
    }
  }, [editor, slug, title])

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>
  }

  if (loading || !editor) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка редактора...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="legal-title" className="text-sm">Заголовок</Label>
        <Input
          id="legal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Политика конфиденциальности"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Текст документа</Label>
        <div className="border border-border rounded-md overflow-hidden bg-background">
          <Toolbar editor={editor} />
          <EditorContent editor={editor} />
        </div>
        <p className="text-xs text-muted-foreground">
          Поддерживается форматирование: заголовки H1-H3, жирный, курсив, списки, ссылки.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-muted-foreground">
          {updatedAt
            ? `Последнее изменение: ${new Date(updatedAt).toLocaleString("ru-RU")}`
            : "Документ ещё не сохранялся"}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}

// ─── Toolbar ───────────────────────────────────────────────────────────────

interface ToolbarProps { editor: Editor }

function Toolbar({ editor }: ToolbarProps) {
  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("URL ссылки", previous ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
      <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Жирный">
        <Bold className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Курсив">
        <Italic className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Зачёркнутый">
        <Strikethrough className="w-4 h-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Заголовок H1">
        <Heading1 className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Заголовок H2">
        <Heading2 className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Заголовок H3">
        <Heading3 className="w-4 h-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Маркированный список">
        <List className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Нумерованный список">
        <ListOrdered className="w-4 h-4" />
      </ToolbarBtn>
      <Sep />
      <ToolbarBtn active={editor.isActive("link")} onClick={setLink} title="Ссылка">
        <Link2 className="w-4 h-4" />
      </ToolbarBtn>
      {editor.isActive("link") && (
        <ToolbarBtn active={false} onClick={() => editor.chain().focus().unsetLink().run()} title="Удалить ссылку">
          <Link2Off className="w-4 h-4" />
        </ToolbarBtn>
      )}
      <Sep />
      <ToolbarBtn active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Отменить">
        <Undo className="w-4 h-4" />
      </ToolbarBtn>
      <ToolbarBtn active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Повторить">
        <Redo className="w-4 h-4" />
      </ToolbarBtn>
    </div>
  )
}

function Sep() {
  return <div className="w-px h-5 bg-border mx-1" />
}

function ToolbarBtn({
  active, disabled, onClick, title, children,
}: { active: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
      )}
    >
      {children}
    </button>
  )
}
