// Менеджер пресетов дожима — общие типы + виртуальные СИСТЕМНЫЕ пресеты.
// Системные (soft/standard/aggressive) собираются из FOLLOWUP_PRESETS +
// default-messages, в БД не хранятся: всегда доступны read-only и копируемы.
// Пользовательские пресеты живут в company_followup_presets.

import { FOLLOWUP_PRESETS, type FollowUpPreset } from "./presets"
import {
  DEFAULT_FOLLOWUP_NOT_OPENED,
  DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED,
  DEFAULT_TEST_NOT_OPENED,
  DEFAULT_TEST_OPENED_NOT_SUBMITTED,
} from "./default-messages"

export interface FollowupPresetDTO {
  id:                 string        // "system:soft" для виртуальных, uuid — для своих
  system:             boolean       // true → read-only (можно только копировать/применять)
  name:               string
  description:        string | null
  preset:             FollowUpPreset
  customDays:         number[] | null
  messages:           string[] | null
  messagesOpened:     string[] | null
  testPreset:         string | null
  testMessages:       string[] | null
  testMessagesOpened: string[] | null
}

// Три системных пресета (off не показываем как редактируемый — это «выкл»).
const SYSTEM_KEYS: FollowUpPreset[] = ["soft", "standard", "aggressive"]

export function buildSystemPresets(): FollowupPresetDTO[] {
  return SYSTEM_KEYS.map((key) => ({
    id:                 `system:${key}`,
    system:             true,
    name:               FOLLOWUP_PRESETS[key].label,
    description:        FOLLOWUP_PRESETS[key].description,
    preset:             key,
    customDays:         null,
    messages:           [...DEFAULT_FOLLOWUP_NOT_OPENED],
    messagesOpened:     [...DEFAULT_FOLLOWUP_OPENED_NOT_FINISHED],
    testPreset:         key,
    testMessages:       [...DEFAULT_TEST_NOT_OPENED],
    testMessagesOpened: [...DEFAULT_TEST_OPENED_NOT_SUBMITTED],
  }))
}

// Найти системный пресет по id ("system:standard").
export function findSystemPreset(id: string): FollowupPresetDTO | null {
  return buildSystemPresets().find((p) => p.id === id) ?? null
}

// Нормализация массива текстов из тела запроса (≤20 строк, ≤2000 симв.).
export function sanitizeMessages(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.map((m) => String(m).slice(0, 2000)).slice(0, 20)
}
