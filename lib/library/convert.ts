/**
 * lib/library/convert.ts
 *
 * Конвертер между форматами анкеты (Question[]) и материала (Lesson[]).
 *
 * questionsToSections — оборачивает плоский список вопросов в один Lesson с
 * одним task-блоком. Используется при переносе анкеты → демо/блок/тест и при
 * загрузке анкеты в диалог-пикер редактора.
 *
 * sectionsToQuestions — собирает все вопросы из всех task-блоков всех уроков.
 * Используется при переносе демо/блок/тест → анкету.
 */

import type { Lesson, Block, Question } from "@/lib/course-types"

// ─── questionsToSections ─────────────────────────────────────────────────────

/**
 * Оборачивает массив вопросов в один урок с одним task-блоком.
 *
 * IDs детерминированы: `les-0` для урока, `blk-0` для блока.
 * Это безопасно — caller должен переименовать id'ы перед вставкой в редактор
 * (notion-editor уже делает это через `Date.now()`-суффикс).
 */
export function questionsToSections(questions: Question[], title: string): Lesson[] {
  const block: Block = {
    id: "blk-0",
    type: "task",
    taskTitle: title,
    taskDescription: "",
    questions,
    // ─── обязательные поля Block (defaults) ──────────────────────────────────
    content: "",
    imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
    videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
    audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
    fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
    infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
    buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary",
    buttonColor: "", buttonIconBefore: "", buttonIconAfter: "",
  }

  const lesson: Lesson = {
    id: "les-0",
    emoji: "✅",
    title,
    blocks: [block],
  }

  return [lesson]
}

// ─── sectionsToQuestions ─────────────────────────────────────────────────────

/**
 * Собирает все вопросы из всех task-блоков всех уроков по порядку.
 */
export function sectionsToQuestions(sections: Lesson[]): Question[] {
  const result: Question[] = []
  for (const lesson of sections) {
    for (const block of lesson.blocks) {
      if (block.type === "task" && Array.isArray(block.questions)) {
        result.push(...block.questions)
      }
    }
  }
  return result
}
