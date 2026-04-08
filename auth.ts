import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { eq, or, ilike } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import type { UserRole } from "@/lib/auth"
import { VKProvider } from "@/lib/auth/vk-provider"

// Expose a stable ref so the JWT callback can read the DB
// (needed when updateSession() is called after onboarding saves companyId)
const getFreshUserFields = async (userId: string): Promise<{ companyId: string | null; name: string | null; avatarUrl: string | null }> => {
  try {
    const [row] = await db
      .select({ companyId: users.companyId, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return { companyId: row?.companyId ?? null, name: row?.name ?? null, avatarUrl: row?.avatarUrl ?? null }
  } catch {
    return { companyId: null, name: null, avatarUrl: null }
  }
}

// ─── Расширяем типы NextAuth ──────────────────────────────────────────────────

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      companyId: string | null
      avatarUrl: string | null
    }
  }

  interface User {
    id?: string
    email?: string | null
    name?: string | null
    role?: UserRole
    companyId?: string | null
  }
}

// ─── NextAuth config ──────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    VKProvider({
      clientId: process.env.VK_CLIENT_ID ?? "",
      clientSecret: process.env.VK_CLIENT_SECRET ?? "",
    }),
    // Dev-only: вход без пароля по userId (development или ALLOW_DEV_LOGIN=true)
    ...(process.env.NODE_ENV === "development" ||
        process.env.ALLOW_DEV_LOGIN === "true" ||
        process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true"
      ? [
          Credentials({
            id: "dev",
            name: "dev",
            credentials: { userId: { label: "User ID", type: "text" } },
            async authorize(credentials) {
              const userId = credentials?.userId as string | undefined
              if (!userId) return null
              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .limit(1)
              if (!user || !user.isActive) return null
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role as UserRole,
                companyId: user.companyId ?? null,
              }
            },
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const login = (credentials?.email as string | undefined)?.trim()
        const password = credentials?.password as string | undefined

        if (!login || !password) return null

        const [user] = await db
          .select()
          .from(users)
          .where(
            or(
              eq(users.email, login.toLowerCase()),
              ilike(users.name, login),
            ),
          )
          .limit(1)

        if (!user || !user.isActive) return null

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          companyId: user.companyId ?? null,
        }
      },
    }),
  ],
  callbacks: {
    // Разрешаем все маршруты — контроль доступа в middleware.ts
    authorized: () => true,
    async jwt({ token, user, trigger, session: sessionData }) {
      if (user) {
        // Initial sign-in: populate token from the user returned by authorize()
        token.id = user.id as string
        token.role = ((user.role as UserRole) ?? "client") as string
        token.companyId = (user.companyId ?? null) as string | null
      }
      // updateSession() fires with trigger === "update".
      if (trigger === "update" && token.id) {
        // Accept name directly from update() call (avoids DB race condition)
        const updateData = sessionData as Record<string, unknown> | undefined
        if (updateData?.name) token.name = updateData.name as string

        const fresh = await getFreshUserFields(token.id as string)
        token.companyId = fresh.companyId
        if (fresh.name && !updateData?.name) token.name = fresh.name
        token.avatarUrl = fresh.avatarUrl
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.name = (token.name as string) ?? session.user.name
      session.user.role = token.role as UserRole
      session.user.companyId = (token.companyId as string | null) ?? null
      session.user.avatarUrl = (token.avatarUrl as string | null) ?? null
      return session
    },
  },
})
