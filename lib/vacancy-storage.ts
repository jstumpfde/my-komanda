"use client"

import {
  ShoppingCart,
  Monitor,
  Settings2,
  LucideIcon,
  Briefcase,
  Users,
  BarChart3,
  Code2,
  Megaphone,
  HeartPulse,
  GraduationCap,
  Wrench,
  Truck,
  Building2,
  PiggyBank,
  Palette,
  Globe,
  Shield,
  Layers,
  FlaskConical,
  Handshake,
  ClipboardList,
  Headphones,
  Store,
  Rocket,
  Star,
  Zap,
  Database,
  LineChart,
} from "lucide-react"

export interface VacancyItem {
  id: string
  name: string
  candidates: number
}

export interface VacancyCategory {
  id: string
  name: string
  icon: string
  iconName: string
  vacancies: number
  candidates: number
  items: VacancyItem[]
  order: number
}

export const iconMap: Record<string, LucideIcon> = {
  ShoppingCart,
  Monitor,
  Settings2,
  Briefcase,
  Users,
  BarChart3,
  Code2,
  Megaphone,
  HeartPulse,
  GraduationCap,
  Wrench,
  Truck,
  Building2,
  PiggyBank,
  Palette,
  Globe,
  Shield,
  Layers,
  FlaskConical,
  Handshake,
  ClipboardList,
  Headphones,
  Store,
  Rocket,
  Star,
  Zap,
  Database,
  LineChart,
}

export const getIconComponent = (iconName: string): LucideIcon => {
  return iconMap[iconName] || Briefcase
}

const defaultCategories: VacancyCategory[] = [
  {
    id: "sales",
    name: "Продажи",
    icon: "Briefcase",
    iconName: "Briefcase",
    vacancies: 5,
    candidates: 47,
    order: 0,
    items: [
      { id: "1", name: "Менеджер по продажам", candidates: 31 },
      { id: "2", name: "Руководитель отдела", candidates: 12 },
      { id: "3", name: "Аккаунт-менеджер", candidates: 4 },
    ]
  },
  {
    id: "it",
    name: "IT",
    icon: "Monitor",
    iconName: "Monitor",
    vacancies: 8,
    candidates: 124,
    order: 1,
    items: [
      { id: "4", name: "Frontend разработчик", candidates: 45 },
      { id: "5", name: "Backend разработчик", candidates: 38 },
      { id: "6", name: "DevOps инженер", candidates: 21 },
      { id: "7", name: "QA инженер", candidates: 20 },
    ]
  },
  {
    id: "operations",
    name: "Операции",
    icon: "Settings2",
    iconName: "Settings2",
    vacancies: 3,
    candidates: 28,
    order: 2,
    items: [
      { id: "8", name: "Операционный менеджер", candidates: 15 },
      { id: "9", name: "Логист", candidates: 13 },
    ]
  },
]

let categories = [...defaultCategories]

export function getVacancyCategories(): VacancyCategory[] {
  return categories.sort((a, b) => a.order - b.order)
}

export function updateVacancyCategory(id: string, updates: Partial<VacancyCategory>) {
  const index = categories.findIndex(c => c.id === id)
  if (index !== -1) {
    categories[index] = { ...categories[index], ...updates }
  }
}

export function reorderCategories(startIndex: number, endIndex: number) {
  const [removed] = categories.splice(startIndex, 1)
  categories.splice(endIndex, 0, removed)
  categories = categories.map((cat, idx) => ({ ...cat, order: idx }))
}

export function reorderCategoryItems(categoryId: string, startIndex: number, endIndex: number) {
  const category = categories.find(c => c.id === categoryId)
  if (category && category.items) {
    const [removed] = category.items.splice(startIndex, 1)
    category.items.splice(endIndex, 0, removed)
  }
}

export function resetCategories() {
  categories = [...defaultCategories]
}
