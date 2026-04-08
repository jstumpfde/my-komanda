"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import {
  type Block,
  type BlockType,
  type Section,
  type Variable,
  createBlock,
} from "./types"
import { BlockCard } from "./block-card"
import { AddBlockButton } from "./add-block-button"
import { SectionSidebar } from "./section-sidebar"

interface UniversalBlockEditorProps {
  blocks: Block[]
  onBlocksChange: (blocks: Block[]) => void
  variables?: Variable[]
  mode?: "full" | "compact"
  readOnly?: boolean
  sectionMode?: boolean
  sections?: Section[]
  onSectionsChange?: (sections: Section[]) => void
}

export function UniversalBlockEditor({
  blocks,
  onBlocksChange,
  variables,
  mode = "full",
  readOnly = false,
  sectionMode = false,
  sections,
  onSectionsChange,
}: UniversalBlockEditorProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    sections?.[0]?.id ?? null
  )
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  // ── Section helpers ──────────────────────────────────────────────────────

  const activeSection = sections?.find((s) => s.id === activeSectionId)

  const currentBlocks =
    sectionMode && activeSection ? activeSection.blocks : blocks

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

  // ── Block operations ─────────────────────────────────────────────────────

  function handleAddBlock(type: BlockType, atIndex?: number) {
    const newBlock = createBlock(type)
    const updated = [...currentBlocks]
    const idx = atIndex !== undefined ? atIndex : updated.length
    updated.splice(idx, 0, newBlock)
    updateCurrentBlocks(reorder(updated))
  }

  function handleChangeBlock(id: string, block: Block) {
    const updated = currentBlocks.map((b) => (b.id === id ? block : b))
    updateCurrentBlocks(updated)
  }

  function handleDeleteBlock(id: string) {
    const updated = currentBlocks.filter((b) => b.id !== id)
    updateCurrentBlocks(reorder(updated))
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

  // ── Section sidebar handlers ─────────────────────────────────────────────

  function handleBlockSelect(blockId: string) {
    // Find which section contains this block
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
    const updated = sections.map((s) => {
      if (s.id !== sectionId) return s
      return {
        ...s,
        blocks: s.blocks.map((b) =>
          b.id === blockId ? { ...b, enabled: !b.enabled } : b
        ),
      }
    })
    onSectionsChange(updated)
  }

  function handleSectionAddBlock(sectionId: string, type: BlockType) {
    if (!sections || !onSectionsChange) return
    const newBlock = createBlock(type)
    const updated = sections.map((s) => {
      if (s.id !== sectionId) return s
      return { ...s, blocks: reorder([...s.blocks, newBlock]) }
    })
    onSectionsChange(updated)
    setActiveSectionId(sectionId)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const blockList = (
    <div className={cn("space-y-1", mode === "compact" && "space-y-0")}>
      {currentBlocks.map((block, index) => (
        <div key={block.id}>
          {index === 0 && !readOnly && (
            <AddBlockButton onAdd={(type) => handleAddBlock(type, 0)} />
          )}
          <BlockCard
            block={block}
            onChange={(b) => handleChangeBlock(block.id, b)}
            onDelete={() => handleDeleteBlock(block.id)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
            onDuplicate={() => handleDuplicate(index)}
            variables={variables}
            isFirst={index === 0}
            isLast={index === currentBlocks.length - 1}
          />
          {!readOnly && (
            <AddBlockButton onAdd={(type) => handleAddBlock(type, index + 1)} />
          )}
        </div>
      ))}
      {currentBlocks.length === 0 && !readOnly && (
        <AddBlockButton onAdd={(type) => handleAddBlock(type)} />
      )}
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
        <div className="flex-1 overflow-y-auto p-4">{blockList}</div>
      </div>
    )
  }

  return <div className="w-full">{blockList}</div>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reorder(blocks: Block[]): Block[] {
  return blocks.map((b, i) => ({ ...b, order: i }))
}
