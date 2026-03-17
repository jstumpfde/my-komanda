"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export type UserRole = "admin" | "manager" | "client"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  company?: string
  avatar?: string
}

const defaultUsers: Record<UserRole, User> = {
  admin: {
    id: "u-admin",
    name: "Анна Иванова",
    email: "anna@hireflow.ru",
    role: "admin",
    avatar: "",
  },
  manager: {
    id: "u-manager",
    name: "Дмитрий Козлов",
    email: "dmitry@hireflow.ru",
    role: "manager",
    avatar: "",
  },
  client: {
    id: "u-client",
    name: "Елена Смирнова",
    email: "elena@techcorp.ru",
    role: "client",
    company: "TechCorp",
    avatar: "",
  },
}

interface AuthContextValue {
  user: User
  role: UserRole
  setRole: (role: UserRole) => void
  hasAccess: (allowed: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("admin")
  const user = defaultUsers[role]

  const hasAccess = (allowed: UserRole[]) => allowed.includes(role)

  return (
    <AuthContext.Provider value={{ user, role, setRole, hasAccess }}>
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
  manager: "Менеджер",
  client: "Клиент",
}
