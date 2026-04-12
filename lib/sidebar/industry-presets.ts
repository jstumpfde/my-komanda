import type { ModuleId } from "@/lib/modules/types"

export interface IndustryPreset {
  id: string
  emoji: string
  label: string
  modules: ModuleId[]
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  { id: "clinic", emoji: "🏥", label: "Клиника / Стоматология", modules: ["hr", "learning", "knowledge", "booking", "sales", "marketing"] },
  { id: "autoservice", emoji: "🚗", label: "Автосервис", modules: ["hr", "sales", "booking", "warehouse", "marketing"] },
  { id: "hotel", emoji: "🏨", label: "Отель / Хостел", modules: ["hr", "booking", "sales", "marketing", "tasks"] },
  { id: "construction", emoji: "🏗", label: "Строительство", modules: ["hr", "sales", "b2b", "logistics", "warehouse", "tasks"] },
  { id: "manufacturing", emoji: "🏭", label: "Производство", modules: ["hr", "learning", "warehouse", "logistics", "sales", "qc", "tasks"] },
  { id: "it", emoji: "💻", label: "IT-компания", modules: ["hr", "learning", "knowledge", "sales", "tasks", "marketing"] },
  { id: "retail", emoji: "🛒", label: "Ритейл / Магазин", modules: ["hr", "sales", "warehouse", "marketing", "dialer"] },
  { id: "callcenter", emoji: "📞", label: "Колл-центр", modules: ["hr", "learning", "sales", "qc", "dialer"] },
  { id: "education", emoji: "🎓", label: "Обучающий центр", modules: ["hr", "learning", "knowledge", "sales", "booking", "marketing"] },
  { id: "custom", emoji: "⚙️", label: "Своё", modules: [] },
]
