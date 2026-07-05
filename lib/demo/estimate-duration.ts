// Оценка объёма демо для первого экрана кандидата: «≈N минут · M шагов».
//
// Задача «конверсия демо» (координатор+Юрий, 05.07): 77-85% бросивших демо
// уходят с порога — кандидат не видит объёма ДО стены блоков. Даём лёгкую,
// честную оценку, посчитанную из реального содержимого демо, а не хардкод-текст.
//
// Эвристика по типам блока (секунды одного блока):
//   text/info    — по длине контента: ~200 знаков/мин чтения, минимум 10с
//   image        — 10с (разглядеть)
//   video        — используем durationSec, если задан (stories/videoIntro
//                  зеркалим отдельно); иначе дефолт 30с (не знаем длину файла)
//   audio        — 20с
//   file         — 10с (просмотреть/скачать)
//   button       — 5с (просто клик)
//   task         — 30с на вопрос (мин. 1 вопрос = 30с, если вопросов нет — 15с)
//   media        — запись видео/аудио/фото кандидатом: используем
//                  mediaMaxDuration, если задан и разумен, иначе 60с
//   stories      — сумма durationSec карточек (фото — durationSec/дефолт,
//                  видео — тоже используем durationSec поле карточки, если есть)
//   pdf          — 15с на страницу (pdfPageCount), минимум 15с
//
// Итоговое время округляется вверх до минуты (пользователю не нужна точность
// до секунды, а округление вниз обесценивает эстимейт — реальное время часто
// больше среднего).

import type { Block } from "@/lib/course-types"
import { STORIES_CARD_DEFAULT_DURATION_SEC } from "@/lib/course-types"

const READING_CHARS_PER_MINUTE = 1000 // ~200 слов/мин * ~5 знаков/слово
const MIN_TEXT_SECONDS = 10
const IMAGE_SECONDS = 10
const AUDIO_SECONDS = 20
const FILE_SECONDS = 10
const BUTTON_SECONDS = 5
const TASK_SECONDS_PER_QUESTION = 30
const TASK_SECONDS_NO_QUESTIONS = 15
const MEDIA_DEFAULT_SECONDS = 60
const MEDIA_MAX_REASONABLE_SECONDS = 300 // потолок — иначе видеоблок на 15 мин исказит эстимейт
const VIDEO_DEFAULT_SECONDS = 30
const PDF_SECONDS_PER_PAGE = 15
const PDF_MIN_SECONDS = 15

function textReadingSeconds(content: string | undefined | null): number {
  const len = content?.length ?? 0
  const seconds = Math.ceil((len / READING_CHARS_PER_MINUTE) * 60)
  return Math.max(MIN_TEXT_SECONDS, seconds)
}

function estimateBlockSeconds(block: Block): number {
  switch (block.type) {
    case "text":
    case "info":
      return textReadingSeconds(block.content)
    case "image":
      return IMAGE_SECONDS
    case "video":
      return VIDEO_DEFAULT_SECONDS
    case "audio":
      return AUDIO_SECONDS
    case "file":
      return FILE_SECONDS
    case "button":
      return BUTTON_SECONDS
    case "task": {
      const count = block.questions?.length ?? 0
      return count > 0 ? count * TASK_SECONDS_PER_QUESTION : TASK_SECONDS_NO_QUESTIONS
    }
    case "media": {
      const max = block.mediaMaxDuration
      if (typeof max === "number" && max > 0) {
        return Math.min(max, MEDIA_MAX_REASONABLE_SECONDS)
      }
      return MEDIA_DEFAULT_SECONDS
    }
    case "stories": {
      const cards = block.storiesCards ?? []
      if (cards.length === 0) return 0
      return cards.reduce((sum, card) => {
        const dur = typeof card.durationSec === "number" && card.durationSec > 0
          ? card.durationSec
          : STORIES_CARD_DEFAULT_DURATION_SEC
        return sum + dur
      }, 0)
    }
    case "pdf": {
      const pages = block.pdfPageCount ?? block.pdfPages?.length ?? 0
      if (pages <= 0) return PDF_MIN_SECONDS
      return Math.max(PDF_MIN_SECONDS, pages * PDF_SECONDS_PER_PAGE)
    }
    default:
      return MIN_TEXT_SECONDS
  }
}

export interface DemoDurationEstimate {
  /** Число шагов (реальных блоков демо), M в «≈N минут · M шагов». */
  steps: number
  /** Округлённая вверх оценка в минутах, минимум 1. */
  minutes: number
  /** Сырая сумма секунд по всем блокам (для тестов/отладки). */
  totalSeconds: number
}

/**
 * Считает эвристическую оценку длительности демо по реальным блокам.
 * Пустой массив блоков → 0 шагов, 0 минут (первый экран решает, показывать
 * ли строку вообще).
 */
export function estimateDemoDuration(blocks: Block[]): DemoDurationEstimate {
  const steps = blocks.length
  if (steps === 0) {
    return { steps: 0, minutes: 0, totalSeconds: 0 }
  }
  const totalSeconds = blocks.reduce((sum, b) => sum + estimateBlockSeconds(b), 0)
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60))
  return { steps, minutes, totalSeconds }
}
