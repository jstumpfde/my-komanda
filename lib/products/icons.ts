// lib/products/icons.ts
//
// Маппинг имени иконки (строка в каталоге ProductPublicManifest.icon) на
// компонент lucide-react. Строка в каталоге, а не сам компонент, чтобы каталог
// оставался сериализуемыми данными (см. правило «не хардкодить конфигурируемое»).

import {
  Users,
  Users2,
  Search,
  BookOpen,
  Phone,
  Handshake,
  Megaphone,
  Mail,
  GraduationCap,
  Sparkles,
  Globe,
  type LucideIcon,
} from "lucide-react"

export const PRODUCT_ICONS: Record<string, LucideIcon> = {
  Users,
  Users2,
  Search,
  BookOpen,
  Phone,
  Handshake,
  Megaphone,
  Mail,
  GraduationCap,
  Sparkles,
  Globe,
}

export function getProductIcon(name: string): LucideIcon {
  return PRODUCT_ICONS[name] ?? Sparkles
}
