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
  isLoggedIn: boolean
  isViewingAs: boolean
  setRole: (role: UserRole) => void
  hasAccess: (allowed: UserRole[]) => boolean
  returnToAdmin: () => void
  login: (role: UserRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_LOGGED_IN = "hireflow-logged-in"
const STORAGE_VIEW_ROLE = "hireflow-view-role"
const STORAGE_AUTH_ROLE = "hireflow-auth-role"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>("admin")
  const [realRole, setRealRole] = useState<UserRole>("admin")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const loggedIn = localStorage.getItem(STORAGE_LOGGED_IN) === "true"
      const savedAuthRole = localStorage.getItem(STORAGE_AUTH_ROLE) as UserRole | null
      const savedViewRole = localStorage.getItem(STORAGE_VIEW_ROLE) as UserRole | null

      if (loggedIn && savedAuthRole && defaultUsers[savedAuthRole]) {
        setIsLoggedIn(true)
        setRealRole(savedAuthRole)
        const viewRole = savedViewRole && defaultUsers[savedViewRole] ? savedViewRole : savedAuthRole
        setRoleState(viewRole)
      }
      setHydrated(true)
    }
  }, [])

  const login = (r: UserRole) => {
    setIsLoggedIn(true)
    setRealRole(r)
    setRoleState(r)
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_LOGGED_IN, "true")
      localStorage.setItem(STORAGE_AUTH_ROLE, r)
      localStorage.setItem(STORAGE_VIEW_ROLE, r)
    }
  }

  const logout = () => {
    setIsLoggedIn(false)
    setRealRole("admin")
    setRoleState("admin")
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_LOGGED_IN)
      localStorage.removeItem(STORAGE_AUTH_ROLE)
      localStorage.removeItem(STORAGE_VIEW_ROLE)
    }
  }

  const setRole = (r: UserRole) => {
    setRoleState(r)
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_VIEW_ROLE, r)
  }

  const returnToAdmin = () => setRole(realRole)

  const user = defaultUsers[role]
  const isViewingAs = role !== realRole
  const hasAccess = (allowed: UserRole[]) => allowed.includes(role)

  // Prevent rendering with wrong state before hydration
  if (!hydrated) return null

  return (
    <AuthContext.Provider value={{ user, role, realRole, isLoggedIn, isViewingAs, setRole, hasAccess, returnToAdmin, login, logout }}>
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
