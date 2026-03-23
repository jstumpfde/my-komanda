import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core"

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inn: text("inn").unique(),
  kpp: text("kpp"),
  legalAddress: text("legal_address"),
  city: text("city"),
  industry: text("industry"),
  logoUrl: text("logo_url"),
  brandPrimaryColor: text("brand_primary_color").default("#3b82f6"),
  brandBgColor: text("brand_bg_color").default("#f0f4ff"),
  brandTextColor: text("brand_text_color").default("#1e293b"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // 'admin' | 'manager' | 'client' | 'client_hr'
  companyId: uuid("company_id").references(() => companies.id),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
})

export const vacancies = pgTable("vacancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  title: text("title").notNull(),
  city: text("city"),
  format: text("format"), // 'office' | 'hybrid' | 'remote'
  employment: text("employment"), // 'full' | 'part'
  category: text("category"),
  sidebarSection: text("sidebar_section"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  status: text("status").default("draft"), // 'draft' | 'published' | 'paused' | 'closed'
  slug: text("slug").unique().notNull(),
  descriptionJson: jsonb("description_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const demos = pgTable("demos", {
  id: uuid("id").primaryKey().defaultRandom(),
  vacancyId: uuid("vacancy_id").references(() => vacancies.id).notNull(),
  title: text("title").notNull(),
  status: text("status").default("draft"), // 'draft' | 'published'
  lessonsJson: jsonb("lessons_json").notNull().default("[]"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  vacancyId: uuid("vacancy_id").references(() => vacancies.id).notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  source: text("source"), // 'hh' | 'avito' | 'telegram' | 'site' | 'referral' | 'manual'
  stage: text("stage").default("new"), // 'new' | 'demo' | 'scheduled' | 'interviewed' | 'hired' | 'rejected'
  score: integer("score"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  experience: text("experience"),
  skills: text("skills").array().default([]),
  token: text("token").unique().notNull(),
  demoProgressJson: jsonb("demo_progress_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})
