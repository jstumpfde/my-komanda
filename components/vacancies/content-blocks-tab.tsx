"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Pencil, Trash2, Sparkles, FileText, AlertCircle, Save, BookOpen, Eye, Check, Download, ChevronDown, FilePlus, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useContentBlocks, type ContentBlock, type ContentType } from "@/hooks/use-content-blocks"
import { NotionEditor, type NotionEditorHandle } from "./notion-editor"
import { createBlock, type Demo, type Lesson } from "@/lib/course-types"

/** Блок «оценивается ИИ», если внутри есть формы: вопросы (task) или запись медиа от кандидата (media). */
function blockHasScoredContent(lessons: Lesson[]): boolean {
  return lessons.some(l => Array.isArray(l.blocks) && l.blocks.some(b => b.type === "task" || b.type === "media"))
}

/** Блок «привязан к воронке» (используется в обработке кандидатов). Фаза 1: легаси
 *  demo/test реально читает рантайм → «Активно». Новые block:* пока не подключены
 *  → «Черновик». Фаза 2 будет считать это из реальных связей с этапами воронки. */
function blockIsLinked(kind: string): boolean {
  return kind === "demo" || kind === "test"
}

/** Дата последнего изменения: ДД.ММ.ГГГГ ЧЧ:ММ */
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function blockToDemo(block: ContentBlock): Demo {
  return {
    id: block.id,
    title: block.title,
    companyName: "",
    description: "",
    status: block.status,
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
    coverGradientFrom: "#6366f1",
    coverGradientTo: "#8b5cf6",
    lessons: block.lessons,
  }
}

/** Бэдж типа блока — синий «Демо» или янтарный «Тест». */
function ContentTypeBadge({ contentType }: { contentType: ContentType }) {
  if (contentType === "test" || contentType === "task") {
    return (
      <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 shrink-0">
        Тест
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 shrink-0">
      Демо
    </span>
  )
}

interface ContentBlocksTabProps {
  vacancyId: string
  vacancyTitle?: string | null
}

export function ContentBlocksTab({ vacancyId }: ContentBlocksTabProps) {
  const { blocks, loading, error, createBlock: apiCreateBlock, updateBlock, saveSettings, deleteBlock, reorder, setLiveBattle } = useContentBlocks(vacancyId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Диалог выбора типа при создании блока
  const [typePickerOpen, setTypePickerOpen] = useState(false)

  // Управление редактором выбранного блока (общий ряд кнопок справа)
  const editorRef = useRef<NotionEditorHandle>(null)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved")
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null)

  // Drag-reorder (горизонтальный)
  const dragIdxRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Выбор первого блока после загрузки / сброс при удалении выбранного
  useEffect(() => {
    if (!loading && blocks.length > 0 && !selectedId) {
      // Предпочитаем первый block:* (не legacy kind='demo'/'test')
      const first = blocks.find(b => b.kind.startsWith("block:")) ?? blocks[0]
      setSelectedId(first.id)
    }
    if (selectedId && !blocks.find(b => b.id === selectedId)) {
      const first = blocks.find(b => b.kind.startsWith("block:")) ?? (blocks.length > 0 ? blocks[0] : null)
      setSelectedId(first ? first.id : null)
    }
  }, [blocks, loading, selectedId])

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

  // Создать блок с выбором типа
  const handleAddBlock = useCallback(() => {
    setTypePickerOpen(true)
  }, [])

  const doCreateBlock = useCallback(async (contentType: ContentType) => {
    setTypePickerOpen(false)
    setCreating(true)
    const title = contentType === "test" || contentType === "task" ? "Новый тест" : "Новый блок"
    const block = await apiCreateBlock(contentType, title)
    setCreating(false)
    if (block) {
      setSelectedId(block.id)
      setRenamingId(block.id)
      setRenamingValue(title)
      // Если первый тест-блок на вакансии — автоматически делаем боевым
      if (contentType === "test" || contentType === "task") {
        const hasOtherLive = blocks.some(b => b.contentType === contentType && b.isLiveBattle)
        if (!hasOtherLive) {
          await setLiveBattle(block.id, true)
        }
      }
    } else {
      toast.error("Не удалось создать блок")
    }
  }, [apiCreateBlock, blocks, setLiveBattle])

  const startRenaming = useCallback((block: ContentBlock) => {
    setRenamingId(block.id)
    setRenamingValue(block.title)
  }, [])

  const commitRename = useCallback((id: string) => {
    const val = renamingValue.trim()
    updateBlock(id, { title: val || "Новый блок" })
    setRenamingId(null)
  }, [renamingValue, updateBlock])

  // Обновление контента из NotionEditor
  const handleEditorUpdate = useCallback((updated: Demo) => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, {
      lessons: updated.lessons,
      title: updated.title !== selectedBlock.title ? updated.title : undefined,
    })
  }, [selectedBlock, updateBlock])

  // «Создать с нуля» — сбросить контент блока к одному пустому уроку.
  const blockHasContent = (b: ContentBlock | null) =>
    !!b && b.lessons.some(l => (l.title || "").trim() || l.blocks?.some(bl => (bl.content || "").trim() || (bl.questions?.length ?? 0) > 0))

  const doResetBlank = useCallback((id: string) => {
    updateBlock(id, { lessons: [{ id: `les-${Date.now()}`, emoji: "", title: "Новый урок", blocks: [createBlock("text")] }] })
    setResetConfirmId(null)
  }, [updateBlock])

  const handleResetBlank = useCallback(() => {
    if (!selectedBlock) return
    if (blockHasContent(selectedBlock)) setResetConfirmId(selectedBlock.id)
    else doResetBlank(selectedBlock.id)
  }, [selectedBlock, doResetBlank])

  // Drag-and-drop reorder
  const handleDragStart = (idx: number) => { dragIdxRef.current = idx }
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx) }
  const handleDrop = async (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const fromIdx = dragIdxRef.current
    if (fromIdx === null || fromIdx === idx) { setDragOverIdx(null); return }
    const newOrder = [...blocks]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(idx, 0, moved)
    setDragOverIdx(null)
    dragIdxRef.current = null
    await reorder(newOrder.map(b => b.id))
  }
  const handleDragEnd = () => { dragIdxRef.current = null; setDragOverIdx(null) }

  // Переключатель «Боевой тест/демо» — показывать только для block:* блоков
  const handleToggleLiveBattle = useCallback(async (block: ContentBlock, isLive: boolean) => {
    await setLiveBattle(block.id, isLive)
    if (isLive) {
      const typeName = block.contentType === "presentation" ? "демо" : "тест"
      toast.success(`Блок «${block.title}» — боевой ${typeName} вакансии`)
    }
  }, [setLiveBattle])

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )
  }

  // Видимость блоков в конструкторе:
  // - block:* — всегда видны (новый формат).
  // - Легаси kind='demo'/'test' — боевые записи старого формата. 13 вакансий
  //   живут ТОЛЬКО на них, поэтому прятать их нельзя (демо «исчезнет»).
  //   Прячем легаси-строку только когда ею уже управляет dual-write —
  //   т.е. существует block:* того же типа с включённым «Боевой».
  const liveTestBlockExists = blocks.some(b => b.kind.startsWith("block:") && b.contentType === "test" && b.isLiveBattle)
  const liveDemoBlockExists = blocks.some(b => b.kind.startsWith("block:") && b.contentType !== "test" && b.isLiveBattle)
  const uiBlocks = blocks
    .filter(b =>
      b.kind.startsWith("block:")
      || (b.kind === "test" && !liveTestBlockExists)
      || (b.kind === "demo" && !liveDemoBlockExists)
    )
    .map(b =>
      b.kind === "demo" ? { ...b, contentType: "presentation" as ContentBlock["contentType"], isLiveBattle: true }
      : b.kind === "test" ? { ...b, contentType: "test" as ContentBlock["contentType"], isLiveBattle: true }
      : b
    )

  // Пустое состояние
  if (uiBlocks.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">Блоков контента нет</p>
            <p className="text-sm text-muted-foreground mt-1">Создайте блок и наполните его чем угодно — текст, видео, вопросы, задание</p>
          </div>
          <button
            disabled={creating}
            onClick={handleAddBlock}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm hover:bg-primary/90 transition-colors"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Добавить блок
          </button>
        </div>

        {/* Диалог выбора типа блока */}
        <BlockTypePickerDialog
          open={typePickerOpen}
          onClose={() => setTypePickerOpen(false)}
          onCreate={doCreateBlock}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ─── Единый ряд: слева чипы-блоки (скролл), справа действия редактора ─── */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Блоки контента — по порядку показа кандидату */}
        <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 pb-0.5">
          {uiBlocks.map((block, idx) => {
            const isActive = selectedId === block.id
            const isRenaming = renamingId === block.id
            const scored = blockHasScoredContent(block.lessons)
            return (
              <div
                key={block.id}
                draggable={!isRenaming}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => { if (!isRenaming) setSelectedId(block.id) }}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-lg border px-2.5 h-9 cursor-pointer select-none shrink-0 transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card hover:bg-muted/60 text-foreground",
                  dragOverIdx === idx && dragIdxRef.current !== idx && "ring-2 ring-primary/40"
                )}
                title="Перетащите, чтобы изменить порядок"
              >
                <span className={cn(
                  "text-[10px] font-semibold w-4 h-4 rounded flex items-center justify-center shrink-0",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{idx + 1}</span>

                {/* Тип блока */}
                {!isRenaming && <ContentTypeBadge contentType={block.contentType} />}

                {/* Иконка молнии — боевой блок */}
                {!isRenaming && block.isLiveBattle && (
                  <span title="Боевой блок — уходит кандидатам" className="shrink-0">
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-400" />
                  </span>
                )}

                {isRenaming ? (
                  <input
                    autoFocus
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => commitRename(block.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(block.id) }
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Название блока…"
                    className="w-40 text-xs font-medium bg-transparent border-b border-primary/50 outline-none placeholder:opacity-50"
                  />
                ) : (
                  <span
                    className="text-xs font-medium truncate max-w-[180px]"
                    onDoubleClick={(e) => { e.stopPropagation(); startRenaming(block) }}
                  >{block.title}</span>
                )}

                {scored && !isRenaming && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[9px] font-medium text-primary shrink-0"
                    title="Содержит формы (вопросы/задание/запись) — оценивает ИИ"
                  >
                    <Sparkles className="w-2.5 h-2.5" />ИИ
                  </span>
                )}

                {!isRenaming && (
                  <span className="hidden group-hover:inline-flex items-center gap-0.5 shrink-0 ml-0.5">
                    <button
                      title="Переименовать"
                      onClick={(e) => { e.stopPropagation(); startRenaming(block) }}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    ><Pencil className="w-3 h-3" /></button>
                    <button
                      title="Удалить"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(block.id) }}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted"
                    ><Trash2 className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
            )
          })}

          {/* «+ Блок» — сразу за крайним чипом, едет вправо при добавлении */}
          <button
            type="button"
            disabled={creating}
            onClick={handleAddBlock}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 h-9 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Блок
          </button>
        </div>

        {/* Действия редактора выбранного блока — справа */}
        {selectedBlock && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Сохранить (split): Сохранить + ▼ (В библиотеку / Скачать) */}
            <div className="flex items-center">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 rounded-r-none border-r-0" onClick={() => editorRef.current?.save()}>
                {saveStatus === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Сохранить
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2 rounded-l-none">
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => editorRef.current?.openSaveTemplate()}>
                    <Save className="w-3.5 h-3.5" />В библиотеку
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => editorRef.current?.downloadTxt()}>
                    <Download className="w-3.5 h-3.5" />Скачать
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Создать из... (dropdown): Создать с нуля / Из библиотеки */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Sparkles className="w-3.5 h-3.5" />Создать из...
                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleResetBlank}>
                  <FilePlus className="w-3.5 h-3.5" />Создать с нуля
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => editorRef.current?.openLibrary()}>
                  <BookOpen className="w-3.5 h-3.5" />Из библиотеки
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => editorRef.current?.openPreview()}>
              <Eye className="w-3.5 h-3.5" />Предпросмотр
            </Button>
          </div>
        )}
      </div>

      {/* Статус блока + переключатель «Боевой» */}
      {selectedBlock && (
        <div className="flex items-center justify-between -mt-1">
          {/* Статус активности */}
          <div className="text-[11px] leading-tight">
            <span className={cn("font-medium", blockIsLinked(selectedBlock.kind) ? "text-emerald-600" : "text-amber-600")}>
              {blockIsLinked(selectedBlock.kind) ? "● Активно" : "○ Черновик"}
            </span>
            <span className="text-muted-foreground/60"> · изм. {fmtDate(selectedBlock.updatedAt)}</span>
          </div>

          {/* Переключатель «Боевой» — только для block:* блоков */}
          {selectedBlock.kind.startsWith("block:") && (
            <LiveBattleToggle
              block={selectedBlock}
              allBlocks={uiBlocks}
              onToggle={handleToggleLiveBattle}
            />
          )}
        </div>
      )}

      {/* ─── Редактор выбранного блока (во всю ширину, без своего тулбара/заголовка).
           Без фикс-высоты/overflow — превью кандидата прокручивается до кнопок «Назад/Далее». ─── */}
      <div className="min-h-0">
        {selectedBlock ? (
          <NotionEditor
            key={selectedBlock.id}
            ref={editorRef}
            demo={blockToDemo(selectedBlock)}
            onBack={() => {}}
            onUpdate={handleEditorUpdate}
            onSaveStatusChange={setSaveStatus}
            hideToolbar={true}
            showSidebar={true}
            vacancyId={vacancyId}
            navButtonColor={typeof selectedBlock.postDemoSettings?.navButtonColor === "string" ? selectedBlock.postDemoSettings.navButtonColor : undefined}
            navButtonText={typeof selectedBlock.postDemoSettings?.navButtonText === "string" ? selectedBlock.postDemoSettings.navButtonText : undefined}
            onNavButtonChange={(color, text) => saveSettings(selectedBlock.id, { navButtonColor: color, navButtonText: text })}
            showSystemNav={typeof selectedBlock.postDemoSettings?.showSystemNav === "boolean" ? selectedBlock.postDemoSettings.showSystemNav : undefined}
            onShowSystemNavChange={(value) => saveSettings(selectedBlock.id, { showSystemNav: value })}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Выберите блок сверху
          </div>
        )}
      </div>

      {/* Диалог выбора типа блока */}
      <BlockTypePickerDialog
        open={typePickerOpen}
        onClose={() => setTypePickerOpen(false)}
        onCreate={doCreateBlock}
      />

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить блок?</AlertDialogTitle>
            <AlertDialogDescription>
              Блок и весь его контент будут удалены. Это действие нельзя отменить.
              {deleteConfirmId && blocks.find(b => b.id === deleteConfirmId)?.isLiveBattle && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                  Это боевой блок — после удаления тест/демо кандидатам будет недоступен.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteConfirmId) return
                const ok = await deleteBlock(deleteConfirmId)
                setDeleteConfirmId(null)
                if (ok) toast.success("Блок удалён")
                else toast.error("Не удалось удалить блок")
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение «Создать с нуля» — затирание текущего контента блока */}
      <AlertDialog open={!!resetConfirmId} onOpenChange={open => { if (!open) setResetConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать с нуля?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущий контент блока будет заменён одним пустым уроком. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (resetConfirmId) doResetBlank(resetConfirmId) }}>
              Создать с нуля
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Переключатель «Боевой тест/демо вакансии» ───────────────────────────────

interface LiveBattleToggleProps {
  block: ContentBlock
  allBlocks: ContentBlock[]
  onToggle: (block: ContentBlock, isLive: boolean) => Promise<void>
}

function LiveBattleToggle({ block, allBlocks, onToggle }: LiveBattleToggleProps) {
  const [busy, setBusy] = useState(false)

  const typeName = block.contentType === "presentation" ? "демо" : "тест"
  const label = `Боевой ${typeName} вакансии`

  // Есть ли другой боевой блок того же типа
  const otherLive = allBlocks.find(b => b.id !== block.id && b.contentType === block.contentType && b.isLiveBattle)

  const handleChange = async (checked: boolean) => {
    // Нельзя снять флаг если это единственный боевой (можно только переключить на другой)
    if (!checked && block.isLiveBattle && !otherLive) return
    setBusy(true)
    try {
      await onToggle(block, checked)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      <Label htmlFor={`live-battle-${block.id}`} className="text-[11px] text-muted-foreground cursor-pointer select-none flex items-center gap-1">
        <Zap className={cn("w-3 h-3", block.isLiveBattle ? "text-amber-500 fill-amber-400" : "text-muted-foreground/50")} />
        {label}
      </Label>
      <Switch
        id={`live-battle-${block.id}`}
        checked={block.isLiveBattle}
        disabled={busy}
        onCheckedChange={handleChange}
        className="scale-75 origin-right"
      />
    </div>
  )
}

// ─── Диалог выбора типа блока ─────────────────────────────────────────────────

interface BlockTypePickerDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (contentType: ContentType) => void
}

function BlockTypePickerDialog({ open, onClose, onCreate }: BlockTypePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Тип блока</DialogTitle>
          <DialogDescription>
            Выберите тип нового блока контента
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => onCreate("presentation")}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-left"
          >
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Демонстрация</p>
              <p className="text-xs text-muted-foreground mt-0.5">Рассказываете о вакансии и компании</p>
            </div>
          </button>
          <button
            onClick={() => onCreate("test")}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:border-amber-300 dark:hover:border-amber-700 transition-colors text-left"
          >
            <span className="text-2xl">📝</span>
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Тест</p>
              <p className="text-xs text-muted-foreground mt-0.5">Задания и вопросы для кандидата</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
