"use client"

import { useSession, signIn, signOut } from "next-auth/react"
import type { UserRole } from "@/lib/auth"

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: UserRole
  companyId: string | null
}

/**
 * Типизированный хук — возвращает данные текущего пользователя из NextAuth сессии.
 * Возвращает null если сессия не загружена или пользователь не авторизован.
 */
export function useCurrentUser(): CurrentUser | null {
  const { data: session, status } = useSession()

  if (status !== "authenticated" || !session?.user) return null

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    companyId: session.user.companyId,
  }
}

export { signIn, signOut }
