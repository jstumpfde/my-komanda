import type { ReactNode, ElementType } from "react"
import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ArrowUpRight,
  Play, Check, Star, Paperclip, Download, Plus,
} from "lucide-react"

// Символ (хранимый ключ, обратная совместимость со старыми кнопками) →
// lucide-компонент. Кнопки хранят прежние символы («▶», «→», …), но рисуем
// их чистыми lucide-иконками — и в редакторе, и на публичных страницах.
const BUTTON_ICON_LUCIDE: Record<string, ElementType> = {
  "←": ArrowLeft,
  "↑": ArrowUp,
  "→": ArrowRight,
  "↓": ArrowDown,
  "↗": ArrowUpRight,
  "⬇": Download,
  "▶": Play,
  "✓": Check,
  "★": Star,
  "📎": Paperclip,
  "📥": Download,
  "+": Plus,
}

/** Рисует иконку кнопки по хранимому символу lucide-иконкой (или null для «Нет»). */
export function renderButtonIcon(symbol: string | undefined | null, className = "w-4 h-4"): ReactNode {
  if (!symbol) return null
  const Icon = BUTTON_ICON_LUCIDE[symbol]
  if (!Icon) return <span className="leading-none">{symbol}</span>
  return <Icon className={className} />
}
