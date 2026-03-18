"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

export type UserRole = "admin" | "manager" | "client" | "client_hr" | "candidate"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  company?: string
  avatar?: string
}

const defaultUsers: Record<UserRole, User> = {
  admin: { id: "u-admin", name: "Анна Иванова", email: "anna@hireflow.ru", role: "admin" },
  manager: { id: "u-manager", name: "Дмитрий Козлов", email: "dmitry@hireflow.ru", role: "manager" },
  client: { id: "u-client", name: "Елена Смирнова", email: "elena@romashka.ru", role: "client", company: "ООО Ромашка" },
  client_hr: { id: "u-client-hr", name: "Ольга Тихонова", email: "olga@romashka.ru", role: "client_hr", company: "ООО Ромашка" },
  candidate: { id: "u-candidate", name: "Иван Петров", email: "ivan@mail.ru", role: "candidate" },
}

interface AuthContextValue {
  user: User
  role: UserRole
  realRole: UserRole
  isViewingAs: boolean
  setRole: (role: UserRole) => void
  hasAccess: (allowed: UserRole[]) => boolean
  returnToAdmin: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>("admin")
  const [realRole] = useState<UserRole>("admin") // always admin in demo

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hireflow-view-role") as UserRole | null
      if (saved && defaultUsers[saved]) setRoleState(saved)
    }
  }, [])

  const setRole = (r: UserRole) => {
    setRoleState(r)
    if (typeof window !== "undefined") localStorage.setItem("hireflow-view-role", r)
  }

  const returnToAdmin = () => setRole("admin")

  const user = defaultUsers[role]
  const isViewingAs = role !== realRole
  const hasAccess = (allowed: UserRole[]) => allowed.includes(role)

  return (
    <AuthContext.Provider value={{ user, role, realRole, isViewingAs, setRole, hasAccess, returnToAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Клиентский менеджер",
  client: "Клиент — Главный HR",
  client_hr: "Клиент — HR менеджер",
  candidate: "Кандидат",
}

export const ROLE_ICONS: Record<UserRole, string> = {
  admin: "👑",
  manager: "🤝",
  client: "👔",
  client_hr: "👤",
  candidate: "🔍",
}

// Sidebar visibility per role
export function getVisibleSections(role: UserRole) {
  switch (role) {
    case "admin":
      return { main: true, hiring: true, tools: true, settings: true, admin: true }
    case "manager":
      return { main: true, hiring: true, tools: true, settings: false, admin: false }
    case "client":
      return { main: true, hiring: true, tools: true, settings: true, admin: false }
    case "client_hr":
      return { main: true, hiring: true, tools: false, settings: false, admin: false }
    case "candidate":
      return { main: false, hiring: false, tools: false, settings: false, admin: false }
  }
}

// Settings items visible per role
export function getVisibleSettings(role: UserRole): string[] {
  switch (role) {
    case "admin": return ["company", "team", "integrations", "schedule", "notifications", "billing"]
    case "client": return ["company", "team", "integrations", "schedule", "notifications", "billing"]
    case "manager": return ["notifications"]
    case "client_hr": return ["notifications"]
    case "candidate": return []
  }
}
