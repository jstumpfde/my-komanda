import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { eq, or, ilike } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"
import type { UserRole } from "@/lib/auth"
import { VKProvider } from "@/lib/auth/vk-provider"
import { isPlatformAdminEmail } from "@/lib/platform/auth"
import { checkPasswordAttempts } from "@/lib/rate-limit"
import { getActingAs } from "@/lib/partner/impersonation"

// Expose a stable ref so the JWT callback can read the DB
// (needed when updateSession() is called after onboarding saves companyId)
const getFreshUserFields = async (userId: string): Promise<{ companyId: string | null; name: string | null; firstName: string | null; lastName: string | null; avatarUrl: string | null; permissions: Record<string, boolean> | null }> => {
  try {
    const [row] = await db
      .select({ companyId: users.companyId, name: users.name, firstName: users.firstName, lastName: users.lastName, avatarUrl: users.avatarUrl, permissions: users.permissions })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return {
      companyId: row?.companyId ?? null,
      name: row?.name ?? null,
      firstName: row?.firstName ?? null,
      lastName: row?.lastName ?? null,
      avatarUrl: row?.avatarUrl ?? null,
      permissions: (row?.permissions as Record<string, boolean> | null) ?? null,
    }
  } catch {
    return { companyId: null, name: null, firstName: null, lastName: null, avatarUrl: null, permissions: null }
  }
}

// ─── Расширяем типы NextAuth ──────────────────────────────────────────────────

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      email: string
      name: string
      firstName: string | null
      lastName: string | null
      role: UserRole
      companyId: string | null
      avatarUrl: string | null
      isPlatformAdmin: boolean
      permissions: Record<string, boolean> | null
      // Per-company оверрайд видимых модулей сайдбара (companies.enabled_modules).
      //   null            — grandfather (модули по роли, текущее поведение);
      //   непустой массив — компания видит ИМЕННО эти ключи модулей.
      // Под impersonation читается по ЭФФЕКТИВНОЙ (клиентской) компании.
      enabledModules?: string[] | null
      // ── Impersonation (партнёр «Войти как клиент») ──
      // Реальная компания-партнёр (когда companyId подменён на клиентскую).
      realCompanyId?: string | null
      // Активная impersonation-сессия (null/undefined = обычный режим).
      actingAs?: { clientCompanyId: string; clientName: string; mode?: "partner" | "admin" } | null
      // Эффективная роль при impersonation = "director" (полный доступ как клиент).
      effectiveRole?: UserRole
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
      async authorize(credentials, req) {
        const login = (credentials?.email as string | undefined)?.trim()
        const password = credentials?.password as string | undefined

        if (!login || !password) return null

        // Лимит: 5 попыток за 15 мин по связке email+IP
        const ip = (req as Record<string, unknown> | undefined)?.headers
          ? String((req as { headers?: Record<string, string> }).headers?.["x-forwarded-for"] ?? "unknown").split(",")[0].trim()
          : "unknown"
        const rlKey = `login:${login.toLowerCase()}:${ip}`
        if (!checkPasswordAttempts(rlKey)) return null

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
        // Load permissions + firstName/lastName on first sign-in
        if (user.id) {
          const fresh = await getFreshUserFields(user.id)
          token.permissions = fresh.permissions
          token.firstName = fresh.firstName
          token.lastName = fresh.lastName
        }
      }
      // updateSession() fires with trigger === "update".
      if (trigger === "update" && token.id) {
        // Accept name directly from update() call (avoids DB race condition)
        const updateData = sessionData as Record<string, unknown> | undefined
        if (updateData?.name) token.name = updateData.name as string

        const fresh = await getFreshUserFields(token.id as string)
        token.companyId = fresh.companyId
        if (fresh.name && !updateData?.name) token.name = fresh.name
        token.firstName = fresh.firstName
        token.lastName = fresh.lastName
        token.avatarUrl = fresh.avatarUrl
        token.permissions = fresh.permissions
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.name = (token.name as string) ?? session.user.name
      session.user.firstName = (token.firstName as string | null) ?? null
      session.user.lastName = (token.lastName as string | null) ?? null
      session.user.role = token.role as UserRole
      session.user.companyId = (token.companyId as string | null) ?? null
      session.user.avatarUrl = (token.avatarUrl as string | null) ?? null
      session.user.isPlatformAdmin = isPlatformAdminEmail(session.user.email)
      session.user.permissions = (token.permissions as Record<string, boolean> | null) ?? null

      // ── Impersonation: партнёр «Войти как клиент» ──────────────────────────
      // Ранний выход для НЕ-партнёров — нулевая стоимость для остального трафика.
      // Реальная личность партнёра остаётся в token; эффективный companyId —
      // только в session. Любая осечка валидации (подпись/БД/владение) →
      // getActingAs() вернёт null и acting-as НЕ применяется (companyId
      // остаётся партнёрским) — fail-safe.
      if (token.role === "partner" || token.role === "platform_admin" || token.role === "admin") {
        const acting = await getActingAs()
        // Сверка: кука принадлежит ИМЕННО текущему пользователю сессии
        // (defense-in-depth против реплея украденной чужой acting-as куки).
        if (acting && acting.realUserId === (token.id as string)) {
          session.user.realCompanyId = (token.companyId as string | null) ?? null
          session.user.companyId = acting.clientCompanyId // ЭФФЕКТИВНЫЙ
          session.user.actingAs = {
            clientCompanyId: acting.clientCompanyId,
            clientName: acting.clientName,
            mode: acting.mode,
          }
          session.user.effectiveRole = "director"
        }
      }

      // ── Per-company оверрайд модулей сайдбара (companies.enabled_modules) ──────
      // Читаем по ЭФФЕКТИВНОМУ companyId (после impersonation выше он уже подменён
      // на клиентский). null/пустой/ошибка → grandfather (поле остаётся null,
      // сайдбар показывает модули по роли — текущее поведение НЕ меняется).
      session.user.enabledModules = null
      const effectiveCompanyId = session.user.companyId
      if (effectiveCompanyId) {
        try {
          const [row] = await db
            .select({ enabledModules: companies.enabledModules })
            .from(companies)
            .where(eq(companies.id, effectiveCompanyId))
            .limit(1)
          const mods = row?.enabledModules
          session.user.enabledModules =
            Array.isArray(mods) && mods.length > 0 ? mods : null
        } catch {
          session.user.enabledModules = null
        }
      }

      return session
    },
  },
})
