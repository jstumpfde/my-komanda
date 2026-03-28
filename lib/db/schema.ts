import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core"

// ─── Modules ──────────────────────────────────────────────────────────────────

export const modules = pgTable("modules", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  icon:        text("icon"),
  isActive:    boolean("is_active").default(true),
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Plans ────────────────────────────────────────────────────────────────────

export const plans = pgTable("plans", {
  id:        uuid("id").primaryKey().defaultRandom(),
  slug:      text("slug").unique().notNull(),
  name:      text("name").notNull(),
  price:     integer("price").notNull(), // в копейках
  currency:  text("currency").default("RUB"),
  interval:  text("interval").default("month"), // 'month' | 'year'
  isPublic:  boolean("is_public").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Plan → Modules (лимиты по тарифу) ───────────────────────────────────────

export const planModules = pgTable("plan_modules", {
  id:            uuid("id").primaryKey().defaultRandom(),
  planId:        uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }).notNull(),
  moduleId:      uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  maxVacancies:  integer("max_vacancies"),   // null = безлимит
  maxCandidates: integer("max_candidates"),
  maxEmployees:  integer("max_employees"),
  maxScenarios:  integer("max_scenarios"),
  maxUsers:      integer("max_users"),
}, (t) => [unique().on(t.planId, t.moduleId)])

// ─── Tenant → Modules (активированные у клиента) ─────────────────────────────
// tenantId → companies.id  (companies выступают как tenant)

export const paymentRequisites = pgTable("payment_requisites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inn: text("inn").notNull(),
  bankAccount: text("bank_account").notNull(),
  bankName: text("bank_name").notNull(),
  bik: text("bik").notNull(),
  corrAccount: text("corr_account").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

export const companies = pgTable("companies", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  name:               text("name").notNull(),
  inn:                text("inn").unique(),
  kpp:                text("kpp"),
  legalAddress:       text("legal_address"),
  city:               text("city"),
  industry:           text("industry"),
  logoUrl:            text("logo_url"),
  brandPrimaryColor:  text("brand_primary_color").default("#3b82f6"),
  brandBgColor:       text("brand_bg_color").default("#f0f4ff"),
  brandTextColor:     text("brand_text_color").default("#1e293b"),
  // billing / subscription
  planId:             uuid("plan_id").references(() => plans.id),
  billingEmail:       text("billing_email"),
  trialEndsAt:        timestamp("trial_ends_at"),
  subscriptionStatus: text("subscription_status").default("trial"), // 'trial'|'active'|'paused'|'cancelled'
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
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

// ─── Adaptation ───────────────────────────────────────────────────────────────

export const adaptationPlans = pgTable("adaptation_plans", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  positionId:  text("position_id"),
  durationDays:integer("duration_days").default(14),
  planType:    text("plan_type").default("onboarding"), // 'onboarding'|'preboarding'|'reboarding'
  isTemplate:  boolean("is_template").default(false),
  isActive:    boolean("is_active").default(true),
  createdBy:   uuid("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const adaptationSteps = pgTable("adaptation_steps", {
  id:             uuid("id").primaryKey().defaultRandom(),
  planId:         uuid("plan_id").references(() => adaptationPlans.id, { onDelete: "cascade" }).notNull(),
  dayNumber:      integer("day_number").notNull(),
  sortOrder:      integer("sort_order").default(0),
  title:          text("title").notNull(),
  type:           text("type").default("lesson"), // 'lesson'|'task'|'quiz'|'video'|'checklist'|'meeting'
  content:        jsonb("content"),
  channel:        text("channel").default("auto"),
  durationMin:    integer("duration_min"),
  isRequired:     boolean("is_required").default(true),
  // D1: Adaptive tracks
  conditions:     jsonb("conditions"),            // { roles?, departments?, minScore? }
  // D4: UGC
  createdByRole:  text("created_by_role").default("hr"), // 'hr'|'buddy'|'employee'
  isApproved:     boolean("is_approved").default(true),
  approvedBy:     uuid("approved_by").references(() => users.id),
  approvedAt:     timestamp("approved_at"),
})

export const adaptationAssignments = pgTable("adaptation_assignments", {
  id:               uuid("id").primaryKey().defaultRandom(),
  planId:           uuid("plan_id").references(() => adaptationPlans.id, { onDelete: "cascade" }).notNull(),
  employeeId:       uuid("employee_id"),
  buddyId:          uuid("buddy_id"),
  startDate:        timestamp("start_date"),
  status:           text("status").default("active"), // 'active'|'paused'|'cancelled'|'completed'
  currentDay:       integer("current_day").default(1),
  completionPct:    integer("completion_pct").default(0),
  totalSteps:       integer("total_steps"),
  completedSteps:   integer("completed_steps").default(0),
  avgResponseTime:  integer("avg_response_time"),
  completedAt:      timestamp("completed_at"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
})

export const stepCompletions = pgTable("step_completions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  stepId:       uuid("step_id").references(() => adaptationSteps.id, { onDelete: "cascade" }).notNull(),
  status:       text("status").default("pending"), // 'pending'|'sent'|'viewed'|'completed'|'skipped'
  sentAt:       timestamp("sent_at"),
  viewedAt:     timestamp("viewed_at"),
  completedAt:  timestamp("completed_at"),
  answer:       jsonb("answer"),
  score:        integer("score"),
  feedback:     text("feedback"),
}, (t) => [unique().on(t.assignmentId, t.stepId)])

// ─── Buddy-система ────────────────────────────────────────────────────────────

export const buddyChecklists = pgTable("buddy_checklists", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:     text("title").notNull(),
  items:     jsonb("items").notNull().default("[]"), // { id, text, order }[]
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
})

export const buddyTasks = pgTable("buddy_tasks", {
  id:              uuid("id").primaryKey().defaultRandom(),
  assignmentId:    uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  checklistItemId: text("checklist_item_id"),
  title:           text("title").notNull(),
  description:     text("description"),
  dayNumber:       integer("day_number"),
  status:          text("status").default("pending"), // 'pending'|'done'|'skipped'
  completedAt:     timestamp("completed_at"),
  note:            text("note"),
  createdAt:       timestamp("created_at").defaultNow(),
})

export const buddyMeetings = pgTable("buddy_meetings", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => adaptationAssignments.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  scheduledAt:  timestamp("scheduled_at"),
  completedAt:  timestamp("completed_at"),
  status:       text("status").default("scheduled"), // 'scheduled'|'completed'|'cancelled'|'rescheduled'
  notes:        text("notes"),
  rating:       integer("rating"),   // 1-5
  feedback:     text("feedback"),
  createdAt:    timestamp("created_at").defaultNow(),
})

// ─── Gamification ─────────────────────────────────────────────────────────────

export const employeePoints = pgTable("employee_points", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:     text("employee_id").notNull(),
  totalPoints:    integer("total_points").default(0),
  level:          integer("level").default(1),
  streak:         integer("streak").default(0),
  lastActiveDate: timestamp("last_active_date"),
}, (t) => [unique().on(t.tenantId, t.employeeId)])

export const pointsHistory = pgTable("points_history", {
  id:         uuid("id").primaryKey().defaultRandom(),
  pointsId:   uuid("points_id").references(() => employeePoints.id, { onDelete: "cascade" }).notNull(),
  amount:     integer("amount").notNull(),
  reason:     text("reason").notNull(),
  sourceType: text("source_type"),
  sourceId:   text("source_id"),
  createdAt:  timestamp("created_at").defaultNow(),
})

export const badges = pgTable("badges", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  description: text("description"),
  icon:        text("icon").notNull(),
  condition:   jsonb("condition"),
  points:      integer("points").default(0),
})

export const employeeBadges = pgTable("employee_badges", {
  id:       uuid("id").primaryKey().defaultRandom(),
  pointsId: uuid("points_id").references(() => employeePoints.id, { onDelete: "cascade" }).notNull(),
  badgeId:  uuid("badge_id").references(() => badges.id, { onDelete: "cascade" }).notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (t) => [unique().on(t.pointsId, t.badgeId)])

// ─── Tenant Modules ───────────────────────────────────────────────────────────

export const tenantModules = pgTable("tenant_modules", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  moduleId:      uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  isActive:      boolean("is_active").default(true),
  activatedAt:   timestamp("activated_at"),
  expiresAt:     timestamp("expires_at"),
  maxVacancies:  integer("max_vacancies"),   // null = безлимит
  maxCandidates: integer("max_candidates"),
  maxEmployees:  integer("max_employees"),
  maxScenarios:  integer("max_scenarios"),
  maxUsers:      integer("max_users"),
}, (t) => [unique().on(t.tenantId, t.moduleId)])
