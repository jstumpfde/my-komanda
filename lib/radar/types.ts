// Общие типы и ярлыки модуля «Радар контента» — без серверных импортов,
// чтобы можно было тянуть и в клиентский компонент страницы /kwigtg.
import type { RadarSource, RadarItemStatus } from "@/lib/db/schema"

export const SOURCE_LABEL: Record<RadarSource, string> = {
  telegram:         "Telegram",
  instagram_saved:  "Instagram · сохранёнки",
  instagram_dm:     "Instagram · Директ",
}

export const STATUS_LABEL: Record<RadarItemStatus, string> = {
  new:   "Новое",
  apply: "Применяю",
  skip:  "Не применяю",
  later: "Позже",
}

// Единица контента в том виде, в каком её отдаёт API списка (для UI).
export interface RadarItemDTO {
  id: string
  source: RadarSource
  sourceAccount: string | null
  viewedOn: string | null
  url: string | null
  mediaType: string | null
  mediaUrl: string | null
  title: string | null
  rawText: string | null
  transcript: string | null
  summary: string | null
  topicId: string | null
  tags: string[]
  service: string | null
  status: RadarItemStatus
  pipelineStatus: string
  capturedAt: string | null
  createdAt: string | null
}

export interface RadarTopicDTO {
  id: string
  parentId: string | null
  name: string
  color: string | null
  count: number          // сколько единиц контента в теме (для дерева слева)
}
