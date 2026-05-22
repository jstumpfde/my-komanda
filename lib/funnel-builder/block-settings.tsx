// Реестр компонентов настроек блоков конструктора воронки (#78).
// Вынесен из blocks.ts, чтобы API route (server) не тянул React-компоненты.
// funnel-builder.tsx импортирует отсюда и рендерит выбранный компонент в Sheet.

import type { ComponentType } from "react"

import { AiChatbotSettings } from "@/components/vacancies/ai-chatbot-settings"
import { FinalScreensSettings } from "@/components/vacancies/final-screens-settings"
import { FirstMessagesChainEditor } from "@/components/vacancies/first-messages-chain-editor"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"

import type { FunnelBlockType } from "./blocks"

export interface BlockSettingsProps {
  vacancyId: string
  onSaved?:  () => void
}

export interface BlockSettingsEntry {
  title:        string
  description?: string
  component:    ComponentType<BlockSettingsProps> | null
}

export const BLOCK_SETTINGS_REGISTRY: Partial<Record<FunnelBlockType, BlockSettingsEntry>> = {
  first_message: {
    component:   FirstMessagesChainEditor,
    title:       "Первое сообщение",
    description: "Серия из 1–3 приветственных сообщений с demo-ссылкой",
  },
  dozhim: {
    component:   VacancyFollowupSettings,
    title:       "Дожим",
    description: "Цепочка касаний для не-открывших и не-завершивших",
  },
  ai_chatbot: {
    component:   AiChatbotSettings,
    title:       "AI чат-бот",
    description: "AI-агент общается с кандидатами вместо обычных сообщений",
  },
  demo: {
    component:   PostDemoSettings,
    title:       "Демонстрация",
    description: "Настройки демо: пороги, превью, поля анкеты",
  },
  anketa: {
    component:   FinalScreensSettings,
    title:       "Анкета",
    description: "Финальные экраны после видео и после анкеты",
  },
  video_intro: {
    component:   null,
    title:       "Видео-визитка",
    description: "Кандидат снимает короткое видео о себе",
  },
  test_task: {
    component:   null,
    title:       "Тестовое задание",
    description: "Отдельная ступень: задание → ответ → AI-проверка",
  },
  reference_check: {
    component:   null,
    title:       "Реф-чек",
    description: "Звонок предыдущему работодателю кандидата",
  },
  offer: {
    component:   null,
    title:       "Оффер",
    description: "Генерация документа об оффере + электронная подпись",
  },
}
