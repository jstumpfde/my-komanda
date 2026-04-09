"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  type Block,
  type BlockType,
  type Section,
  type Variable,
  createBlock,
} from "./types"
import { BlockCard } from "./block-card"
import { BlockToolbar } from "./block-toolbar"
import { AddBlockButton } from "./add-block-button"
import { SectionSidebar } from "./section-sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GripVertical, MoreHorizontal, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Props ───────────────────────────────────────────────────────────────────

export interface UnifiedEditorProps {
  blocks: Block[]
  onBlocksChange: (blocks: Block[]) => void
  variables?: Variable[]
  sectionMode?: boolean
  sections?: Section[]
  onSectionsChange?: (s: Section[]) => void
  readOnly?: boolean
  showPreview?: boolean
  showToolbar?: boolean
  placeholder?: string
  maxBlocks?: number
  allowedBlockTypes?: BlockType[]
}

// ─── Sortable block wrapper ──────────────────────────────────────────────────

function SortableBlock({
  block,
  index,
  total,
  readOnly,
  variables,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onAddBlock,
}: {
  block: Block
  index: number
  total: number
  readOnly?: boolean
  variables?: Variable[]
  onChange: (b: Block) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onAddBlock: (type: BlockType, atIndex: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {index === 0 && !readOnly && (
        <AddBlockButton onAdd={(type) => onAddBlock(type, 0)} />
      )}
      <div className="group/block relative flex gap-1">
        {/* Drag handle + context menu */}
        {!readOnly && (
          <div className="flex flex-col items-center gap-0.5 pt-4 opacity-0 group-hover/block:opacity-100 transition-opacity shrink-0">
            <button
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5 rounded"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground p-0.5 rounded">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="size-3.5 mr-2" /> Дублировать
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveUp} disabled={index === 0}>
                  <ChevronUp className="size-3.5 mr-2" /> Переместить вверх
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveDown} disabled={index === total - 1}>
                  <ChevronDown className="size-3.5 mr-2" /> Переместить вниз
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="size-3.5 mr-2" /> Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Block card */}
        <div className="flex-1 min-w-0">
          <BlockCard
            block={block}
            onChange={onChange}
            onDelete={onDelete}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            variables={variables}
            isFirst={index === 0}
            isLast={index === total - 1}
          />
        </div>
      </div>
      {!readOnly && (
        <AddBlockButton onAdd={(type) => onAddBlock(type, index + 1)} />
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function UnifiedBlockEditor({
  blocks,
  onBlocksChange,
  variables,
  sectionMode = false,
  sections,
  onSectionsChange,
  readOnly = false,
  showToolbar = true,
  placeholder = "Нажмите + или выберите тип блока в панели выше",
  maxBlocks,
  allowedBlockTypes,
}: UnifiedEditorProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    sections?.[0]?.id ?? null
  )
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Section helpers ────────────────────────────────────────────────────────

  const activeSection = sections?.find((s) => s.id === activeSectionId)
  const currentBlocks = sectionMode && activeSection ? activeSection.blocks : blocks

  const updateCurrentBlocks = useCallback(
    (newBlocks: Block[]) => {
      if (sectionMode && sections && onSectionsChange && activeSectionId) {
        const updated = sections.map((s) =>
          s.id === activeSectionId ? { ...s, blocks: newBlocks } : s
        )
        onSectionsChange(updated)
      } else {
        onBlocksChange(newBlocks)
      }
    },
    [sectionMode, sections, onSectionsChange, activeSectionId, onBlocksChange]
  )

  // ── Block operations ───────────────────────────────────────────────────────

  function handleAddBlock(type: BlockType, atIndex?: number) {
    if (maxBlocks && currentBlocks.length >= maxBlocks) return
    const newBlock = createBlock(type)
    const updated = [...currentBlocks]
    const idx = atIndex !== undefined ? atIndex : updated.length
    updated.splice(idx, 0, newBlock)
    updateCurrentBlocks(reorder(updated))
  }

  function handleChangeBlock(id: string, block: Block) {
    updateCurrentBlocks(currentBlocks.map((b) => (b.id === id ? block : b)))
  }

  function handleDeleteBlock(id: string) {
    updateCurrentBlocks(reorder(currentBlocks.filter((b) => b.id !== id)))
  }

  function handleMoveUp(index: number) {
    if (index === 0) return
    const updated = [...currentBlocks]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    updateCurrentBlocks(reorder(updated))
  }

  function handleMoveDown(index: number) {
    if (index >= currentBlocks.length - 1) return
    const updated = [...currentBlocks]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    updateCurrentBlocks(reorder(updated))
  }

  function handleDuplicate(index: number) {
    if (maxBlocks && currentBlocks.length >= maxBlocks) return
    const source = currentBlocks[index]
    const dup: Block = {
      ...source,
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: JSON.parse(JSON.stringify(source.content)),
    }
    const updated = [...currentBlocks]
    updated.splice(index + 1, 0, dup)
    updateCurrentBlocks(reorder(updated))
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = currentBlocks.findIndex((b) => b.id === active.id)
    const newIndex = currentBlocks.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    updateCurrentBlocks(reorder(arrayMove(currentBlocks, oldIndex, newIndex)))
  }

  // ── Section sidebar handlers ───────────────────────────────────────────────

  function handleBlockSelect(blockId: string) {
    if (sections) {
      for (const s of sections) {
        if (s.blocks.some((b) => b.id === blockId)) {
          setActiveSectionId(s.id)
          break
        }
      }
    }
    setActiveBlockId(blockId)
  }

  function handleToggleBlock(sectionId: string, blockId: string) {
    if (!sections || !onSectionsChange) return
    onSectionsChange(
      sections.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, enabled: !b.enabled } : b)) }
      )
    )
  }

  function handleSectionAddBlock(sectionId: string, type: BlockType) {
    if (!sections || !onSectionsChange) return
    const newBlock = createBlock(type)
    onSectionsChange(
      sections.map((s) =>
        s.id !== sectionId ? s : { ...s, blocks: reorder([...s.blocks, newBlock]) }
      )
    )
    setActiveSectionId(sectionId)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const blockList = (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={currentBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0">
          {currentBlocks.map((block, index) => (
            <SortableBlock
              key={block.id}
              block={block}
              index={index}
              total={currentBlocks.length}
              readOnly={readOnly}
              variables={variables}
              onChange={(b) => handleChangeBlock(block.id, b)}
              onDelete={() => handleDeleteBlock(block.id)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onDuplicate={() => handleDuplicate(index)}
              onAddBlock={handleAddBlock}
            />
          ))}
          {currentBlocks.length === 0 && !readOnly && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground mb-4">{placeholder}</p>
              <AddBlockButton onAdd={(type) => handleAddBlock(type)} />
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  )

  const toolbarElement = showToolbar && !readOnly && (
    <div className="flex justify-center py-3">
      <BlockToolbar onAddBlock={(type) => handleAddBlock(type)} allowedTypes={allowedBlockTypes} />
    </div>
  )

  if (sectionMode && sections) {
    return (
      <div className="flex h-full">
        <div className="w-72 shrink-0 border-r overflow-y-auto p-4">
          <SectionSidebar
            sections={sections}
            activeBlockId={activeBlockId}
            onBlockSelect={handleBlockSelect}
            onToggleBlock={handleToggleBlock}
            onAddBlock={handleSectionAddBlock}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {toolbarElement}
          {blockList}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {toolbarElement}
      {blockList}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reorder(blocks: Block[]): Block[] {
  return blocks.map((b, i) => ({ ...b, order: i }))
}
