// ─── Universal Block Editor Types ────────────────────────────────────────────

export type BlockType =
  | "text" | "heading" | "image" | "video" | "audio" | "file"
  | "info" | "button" | "test" | "task" | "video_record" | "divider"

export interface TextContent { html: string }
export interface HeadingContent { text: string; level: 1 | 2 | 3 }
export interface ImageContent { url: string; caption: string; layout: "full" | "left" | "right" }
export interface VideoContent { url: string; caption: string; layout: "full" | "left" | "right" }
export interface AudioContent { url: string; caption: string }
export interface FileContent { url: string; name: string; description: string }
export interface InfoContent { text: string; icon: string; color: string }
export interface ButtonContent { text: string; url: string; color: string; icon: string }
export interface TestContent { questions: TestQuestion[] }
export interface TestQuestion { question: string; options: string[]; correct: number }
export interface TaskContent { question: string; type: "text" | "video" | "file" }
export interface VideoRecordContent { prompt: string; maxDuration: number }
export type DividerContent = Record<string, never>

export type BlockContent =
  | TextContent | HeadingContent | ImageContent | VideoContent | AudioContent
  | FileContent | InfoContent | ButtonContent | TestContent | TaskContent
  | VideoRecordContent | DividerContent

export interface Block {
  id: string
  type: BlockType
  content: BlockContent
  enabled: boolean
  order: number
}

export interface Section {
  id: string
  key: string
  title: string
  emoji: string
  blocks: Block[]
}

export interface Variable {
  key: string
  label: string
  group: string
  value?: string
}

// ─── Block type metadata ─────────────────────────────────────────────────────

export const BLOCK_TYPES: { type: BlockType; label: string; icon: string }[] = [
  { type: "text",         label: "Текст",          icon: "T" },
  { type: "heading",      label: "Заголовок",      icon: "H" },
  { type: "image",        label: "Изображение",    icon: "📷" },
  { type: "video",        label: "Видео",          icon: "🎥" },
  { type: "audio",        label: "Аудио",          icon: "🎵" },
  { type: "file",         label: "Файл",           icon: "📄" },
  { type: "info",         label: "Инфо-блок",      icon: "ℹ️" },
  { type: "button",       label: "Кнопка",         icon: "🔘" },
  { type: "test",         label: "Тест",           icon: "✅" },
  { type: "task",         label: "Задание",        icon: "✍️" },
  { type: "video_record", label: "Видео-визитка",  icon: "📹" },
  { type: "divider",      label: "Разделитель",    icon: "—" },
]

export function createBlock(type: BlockType): Block {
  const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const defaults: Record<BlockType, BlockContent> = {
    text:         { html: "" } as TextContent,
    heading:      { text: "", level: 2 } as HeadingContent,
    image:        { url: "", caption: "", layout: "full" } as ImageContent,
    video:        { url: "", caption: "", layout: "full" } as VideoContent,
    audio:        { url: "", caption: "" } as AudioContent,
    file:         { url: "", name: "", description: "" } as FileContent,
    info:         { text: "", icon: "info", color: "blue" } as InfoContent,
    button:       { text: "Кнопка", url: "", color: "primary", icon: "" } as ButtonContent,
    test:         { questions: [{ question: "", options: ["", ""], correct: 0 }] } as TestContent,
    task:         { question: "", type: "text" } as TaskContent,
    video_record: { prompt: "", maxDuration: 120 } as VideoRecordContent,
    divider:      {} as DividerContent,
  }
  return { id, type, content: defaults[type], enabled: true, order: 0 }
}
