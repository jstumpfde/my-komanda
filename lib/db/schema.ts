import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
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
  id:         uuid("id").primaryKey().defaultRandom(),
  slug:       text("slug").unique().notNull(),
  name:       text("name").notNull(),
  price:      integer("price").notNull(), // в копейках
  currency:   text("currency").default("RUB"),
  interval:   text("interval").default("month"), // 'month' | 'year'
  isPublic:   boolean("is_public").default(true),
  sortOrder:  integer("sort_order").default(0),
  trialDays:  integer("trial_days").default(14),
  isArchived: boolean("is_archived").default(false),
  allowCustomBranding: boolean("allow_custom_branding").default(true),
  archivedAt: timestamp("archived_at"),
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Plan → Modules (лимиты по тарифу) ───────────────────────────────────────

export const planModules = pgTable("plan_modules", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  planId:              uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }).notNull(),
  moduleId:            uuid("module_id").references(() => modules.id, { onDelete: "cascade" }).notNull(),
  maxVacancies:        integer("max_vacancies"),   // null = безлимит
  maxCandidates:       integer("max_candidates"),
  maxEmployees:        integer("max_employees"),
  maxScenarios:        integer("max_scenarios"),
  maxUsers:            integer("max_users"),
  allowCustomBranding: boolean("allow_custom_branding").default(false),
  allowCustomColors:   boolean("allow_custom_colors").default(false),
  limits:              jsonb("limits"),
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
  postalCode:         text("postal_code"),
  foundedYear:        integer("founded_year"),
  revenueRange:       text("revenue_range"),           // Solo wizard step-1
  ogrn:               text("ogrn"),
  fullName:           text("full_name"),
  director:           text("director"),
  description:        text("description"),
  email:              text("email"),
  phone:              text("phone"),
  employeeCount:      integer("employee_count"),
  registrationDate:   text("registration_date"),     // ISO date string
  officeAddress:      text("office_address"),
  postalAddress:      text("postal_address"),
  website:            text("website"),
  crmStatus:          text("crm_status"),              // 'active'|'exists_unused'|'none'
  crmName:            text("crm_name"),
  salesScripts:       text("sales_scripts"),           // 'yes'|'partial'|'no'
  trainingSystem:     text("training_system"),         // 'yes'|'partial'|'no'
  trainer:            text("trainer"),
  salesManagerType:   text("sales_manager_type"),      // 'none'|'hunter'|...
  isMultiProduct:     boolean("is_multi_product").default(false),
  logoUrl:            text("logo_url"),
  brandPrimaryColor:  text("brand_primary_color").default("#3b82f6"),
  brandBgColor:       text("brand_bg_color").default("#f0f4ff"),
  brandTextColor:     text("brand_text_color").default("#1e293b"),
  customTheme:        jsonb("custom_theme"),       // { primary, background, foreground, sidebar, accent }
  // join link
  joinCode:           text("join_code").unique(),
  joinEnabled:        boolean("join_enabled").default(true),
  // billing / subscription
  planId:             uuid("plan_id").references(() => plans.id),
  billingEmail:       text("billing_email"),
  trialEndsAt:        timestamp("trial_ends_at"),
  subscriptionStatus: text("subscription_status").default("trial"), // 'trial'|'active'|'paused'|'cancelled'|'expired'
  currentPlanId:      uuid("current_plan_id").references(() => plans.id),
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
  position: text("position"),                  // реальная должность (не роль в системе)
  permissions: jsonb("permissions").default("{}"), // { manage_company, manage_team, manage_billing, ... }
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Sales: CRM Компании ─────────────────────────────────────────────────────

export const salesCompanies = pgTable("sales_companies", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:           text("name").notNull(),
  inn:            text("inn"),
  kpp:            text("kpp"),
  ogrn:           text("ogrn"),
  industry:       text("industry"),
  city:           text("city"),
  address:        text("address"),
  website:        text("website"),
  phone:          text("phone"),
  email:          text("email"),
  revenue:        text("revenue"),
  employeesCount: integer("employees_count"),
  description:    text("description"),
  logoUrl:        text("logo_url"),
  type:           text("type").default("client"),    // 'own'|'client'|'partner'
  status:         text("status").default("active"),  // 'active'|'archive'
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Sales: CRM Контакты ─────────────────────────────────────────────────────

export const salesContacts = pgTable("sales_contacts", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  companyId:  uuid("company_id").references(() => salesCompanies.id, { onDelete: "set null" }),
  firstName:  text("first_name").notNull(),
  lastName:   text("last_name").notNull(),
  middleName: text("middle_name"),
  position:   text("position"),
  department: text("department"),
  phone:      text("phone"),
  mobile:     text("mobile"),
  email:      text("email"),
  telegram:   text("telegram"),
  whatsapp:   text("whatsapp"),
  comment:    text("comment"),
  isPrimary:  boolean("is_primary").default(false),
  status:     text("status").default("active"),  // 'active'|'archive'
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
})

// ─── Vacancies ────────────────────────────────────────────────────────────────

export const vacancies = pgTable("vacancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
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
  clientCompanyId: uuid("client_company_id").references(() => salesCompanies.id, { onDelete: "set null" }),
  clientContactId: uuid("client_contact_id").references(() => salesContacts.id, { onDelete: "set null" }),
  deletedAt: timestamp("deleted_at"),
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
  anketaAnswers: jsonb("anketa_answers"), // [{question, answer}]
  aiScore: integer("ai_score"),
  aiSummary: text("ai_summary"),
  aiDetails: jsonb("ai_details"), // [{question, score, comment}]
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
  customLimits:  jsonb("custom_limits"),
  enabledAt:     timestamp("enabled_at", { withTimezone: true }),
  disabledAt:    timestamp("disabled_at", { withTimezone: true }),
}, (t) => [unique().on(t.tenantId, t.moduleId)])

// ─── LMS — Курсы ──────────────────────────────────────────────────────────────

export const courses = pgTable("courses", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title").notNull(),
  description:  text("description"),
  coverImage:   text("cover_image"),
  category:     text("category").default("custom"), // 'sales'|'product'|'soft_skills'|'compliance'|'custom'
  difficulty:   text("difficulty").default("beginner"), // 'beginner'|'intermediate'|'advanced'
  durationMin:  integer("duration_min"),
  isPublished:  boolean("is_published").default(false),
  isRequired:   boolean("is_required").default(false),
  requiredFor:  jsonb("required_for"),  // { roles?, departments? }
  sortOrder:    integer("sort_order").default(0),
  createdBy:    uuid("created_by").references(() => users.id),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

export const lessons = pgTable("lessons", {
  id:          uuid("id").primaryKey().defaultRandom(),
  courseId:    uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  sortOrder:   integer("sort_order").default(0),
  type:        text("type").default("content"), // 'content'|'video'|'quiz'|'assignment'
  content:     jsonb("content"),
  durationMin: integer("duration_min"),
  isRequired:  boolean("is_required").default(true),
})

export const courseEnrollments = pgTable("course_enrollments", {
  id:           uuid("id").primaryKey().defaultRandom(),
  courseId:     uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  employeeId:   text("employee_id").notNull(),
  status:       text("status").default("enrolled"), // 'enrolled'|'in_progress'|'completed'|'dropped'
  completionPct:integer("completion_pct").default(0),
  enrolledAt:   timestamp("enrolled_at").defaultNow(),
  startedAt:    timestamp("started_at"),
  completedAt:  timestamp("completed_at"),
  lastAccessAt: timestamp("last_access_at"),
}, (t) => [unique().on(t.courseId, t.employeeId)])

export const lessonCompletions = pgTable("lesson_completions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").references(() => courseEnrollments.id, { onDelete: "cascade" }).notNull(),
  lessonId:     uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }).notNull(),
  status:       text("status").default("not_started"), // 'not_started'|'in_progress'|'completed'
  score:        integer("score"),
  answer:       jsonb("answer"),
  completedAt:  timestamp("completed_at"),
  timeSpentSec: integer("time_spent_sec"),
}, (t) => [unique().on(t.enrollmentId, t.lessonId)])

export const certificates = pgTable("certificates", {
  id:         uuid("id").primaryKey().defaultRandom(),
  courseId:   uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  employeeId: text("employee_id").notNull(),
  number:     text("number").unique().notNull(), // MK-2026-XXXXX
  issuedAt:   timestamp("issued_at").defaultNow(),
  validUntil: timestamp("valid_until"),
  pdfUrl:     text("pdf_url"),
})

// ─── Skills & Assessments ─────────────────────────────────────────────────────

export const skills = pgTable("skills", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }), // null = системный
  name:        text("name").notNull(),
  category:    text("category").notNull().default("soft"), // hard/soft/tool/domain
  description: text("description"),
})

export const positionSkills = pgTable("position_skills", {
  id:            uuid("id").primaryKey().defaultRandom(),
  positionId:    text("position_id").notNull(), // текст — без FK, позиция задаётся произвольно
  skillId:       uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  requiredLevel: integer("required_level").notNull().default(3), // 1-5
}, (t) => [unique().on(t.positionId, t.skillId)])

export const assessments = pgTable("assessments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  type:        text("type").notNull().default("self"), // self/manager/peer/360
  status:      text("status").notNull().default("draft"), // draft/in_progress/completed
  period:      text("period"), // e.g. "2026-Q1"
  createdBy:   uuid("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
})

export const skillAssessments = pgTable("skill_assessments", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "cascade" }).notNull(),
  skillId:      uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  score:        integer("score"),  // 1-5
  comment:      text("comment"),
  assessorId:   text("assessor_id"),
})

export const assessmentReviewers = pgTable("assessment_reviewers", {
  id:           uuid("id").primaryKey().defaultRandom(),
  assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "cascade" }).notNull(),
  reviewerId:   text("reviewer_id").notNull(),
  role:         text("role").notNull().default("peer"), // self/manager/peer/subordinate
  status:       text("status").notNull().default("pending"), // pending/completed/declined
  completedAt:  timestamp("completed_at"),
})

// ─── Блок G: Пульс-опросы ───────────────────────────────────────────────────

export const pulseQuestions = pgTable("pulse_questions", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),  // null = системный
  text:       text("text").notNull(),
  category:   text("category").default("engagement"), // engagement/satisfaction/management/culture/workload/growth/communication/wellbeing/team
  isSystem:   boolean("is_system").default(false),
  isActive:   boolean("is_active").default(true),
  sortOrder:  integer("sort_order").default(0),
})

export const pulseSurveys = pgTable("pulse_surveys", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:        text("title"),
  scheduledAt:  timestamp("scheduled_at"),
  sentAt:       timestamp("sent_at"),
  closesAt:     timestamp("closes_at"),
  status:       text("status").default("draft"),    // draft/scheduled/sent/closed
  channel:      text("channel").default("telegram"), // telegram/whatsapp/email/web
  questionIds:  jsonb("question_ids"),               // uuid[] — 2 вопроса + открытый
  responseCount:integer("response_count").default(0),
  createdAt:    timestamp("created_at").defaultNow(),
})

export const pulseResponses = pgTable("pulse_responses", {
  id:          uuid("id").primaryKey().defaultRandom(),
  surveyId:    uuid("survey_id").references(() => pulseSurveys.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  questionId:  uuid("question_id").references(() => pulseQuestions.id).notNull(),
  score:       integer("score"),          // 1-5 (шкала настроения)
  openText:    text("open_text"),         // ответ на открытый вопрос
  isAnonymous: boolean("is_anonymous").default(true),
  respondedAt: timestamp("responded_at").defaultNow(),
}, (t) => [unique().on(t.surveyId, t.employeeId, t.questionId)])

// ─── Блок G: Flight Risk ────────────────────────────────────────────────────

export const flightRiskScores = pgTable("flight_risk_scores", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:    text("employee_id").notNull(),
  employeeName:  text("employee_name"),
  department:    text("department"),
  position:      text("position"),
  score:         integer("score").notNull().default(0),  // 0-100
  riskLevel:     text("risk_level").default("low"),       // low/medium/high/critical
  factors:       jsonb("factors"),                         // { factorSlug: number }[]
  previousScore: integer("previous_score"),
  trend:         text("trend").default("stable"),          // improving/stable/declining
  calculatedAt:  timestamp("calculated_at").defaultNow(),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.tenantId, t.employeeId)])

export const flightRiskFactors = pgTable("flight_risk_factors", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").unique().notNull(),
  name:        text("name").notNull(),
  category:    text("category").notNull(), // tenure/engagement/pulse/performance/organizational/compensation/development
  weight:      integer("weight").default(1),  // вес фактора (1-10)
  description: text("description"),
  isActive:    boolean("is_active").default(true),
})

export const retentionActions = pgTable("retention_actions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:  text("employee_id").notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  type:        text("type").default("conversation"), // conversation/compensation/development/role_change/team_change/other
  status:      text("status").default("planned"),     // planned/in_progress/completed/cancelled
  priority:    text("priority").default("medium"),     // low/medium/high/urgent
  assignedTo:  uuid("assigned_to").references(() => users.id),
  dueDate:     timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  outcome:     text("outcome"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Блок H: Offboarding ────────────────────────────────────────────────────

export const offboardingCases = pgTable("offboarding_cases", {
  id:              uuid("id").primaryKey().defaultRandom(),
  tenantId:        uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:      text("employee_id").notNull(),
  employeeName:    text("employee_name"),
  department:      text("department"),
  position:        text("position"),
  reason:          text("reason").default("voluntary"),  // voluntary/involuntary/retirement/contract_end/mutual
  lastWorkDay:     timestamp("last_work_day"),
  status:          text("status").default("initiated"),  // initiated/in_progress/exit_interview/completed/cancelled
  checklistJson:   jsonb("checklist_json"),               // { id, title, done, assignedTo }[]
  referralBridge:  boolean("referral_bridge").default(false), // оставить как реферала?
  rehireEligible:  boolean("rehire_eligible").default(true),
  notes:           text("notes"),
  createdBy:       uuid("created_by").references(() => users.id),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
})

export const exitSurveys = pgTable("exit_surveys", {
  id:            uuid("id").primaryKey().defaultRandom(),
  caseId:        uuid("case_id").references(() => offboardingCases.id, { onDelete: "cascade" }).notNull(),
  channel:       text("channel").default("web"),  // web/telegram/email
  status:        text("status").default("pending"), // pending/sent/completed
  sentAt:        timestamp("sent_at"),
  completedAt:   timestamp("completed_at"),
  responses:     jsonb("responses"),  // { questionId: string, question: string, answer: string | number }[]
  overallScore:  integer("overall_score"),  // 1-10 общая оценка опыта
  wouldReturn:   boolean("would_return"),
  wouldRecommend:boolean("would_recommend"),
  openFeedback:  text("open_feedback"),
  isAnonymous:   boolean("is_anonymous").default(false),
  createdAt:     timestamp("created_at").defaultNow(),
})

// ─── Блок I: Reskilling Center ──────────────────────────────────────────────

export const reskillingAssessments = pgTable("reskilling_assessments", {
  id:                uuid("id").primaryKey().defaultRandom(),
  tenantId:          uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  position:          text("position").notNull(),
  department:        text("department"),
  automationRisk:    integer("automation_risk").default(0),    // 0-100%
  riskLevel:         text("risk_level").default("low"),        // low/medium/high/critical
  aiImpactSummary:   text("ai_impact_summary"),                // описание влияния AI
  tasksAtRisk:       jsonb("tasks_at_risk"),                    // { task, riskPct, alternative }[]
  recommendedSkills: jsonb("recommended_skills"),               // { skillName, priority, courseId? }[]
  calculatedAt:      timestamp("calculated_at").defaultNow(),
  createdAt:         timestamp("created_at").defaultNow(),
})

export const reskillingPlans = pgTable("reskilling_plans", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  employeeId:     text("employee_id").notNull(),
  employeeName:   text("employee_name"),
  currentPosition:text("current_position"),
  targetPosition: text("target_position"),
  status:         text("status").default("draft"),    // draft/active/completed/cancelled
  progress:       integer("progress").default(0),      // 0-100
  skills:         jsonb("skills"),                      // { skillId, name, currentLevel, targetLevel, courseId? }[]
  dueDate:        timestamp("due_date"),
  completedAt:    timestamp("completed_at"),
  createdBy:      uuid("created_by").references(() => users.id),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Блок I: Predictive Hiring ──────────────────────────────────────────────

export const predictiveHiringAlerts = pgTable("predictive_hiring_alerts", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  flightRiskId:   uuid("flight_risk_id").references(() => flightRiskScores.id),
  employeeId:     text("employee_id").notNull(),
  employeeName:   text("employee_name"),
  position:       text("position"),
  department:     text("department"),
  riskScore:      integer("risk_score"),
  status:         text("status").default("new"),       // new/vacancy_created/talent_pool_matched/resolved/dismissed
  vacancyId:      uuid("vacancy_id").references(() => vacancies.id),  // auto-created draft
  talentPoolMatch:jsonb("talent_pool_match"),           // matched candidates from pool
  createdAt:      timestamp("created_at").defaultNow(),
  resolvedAt:     timestamp("resolved_at"),
})

// ─── Блок J: Маркетплейс навыков ────────────────────────────────────────────

export const internalProjects = pgTable("internal_projects", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:         text("title").notNull(),
  description:   text("description"),
  department:    text("department"),
  requiredSkills:jsonb("required_skills"),       // { skillName, minLevel }[]
  status:        text("status").default("open"), // open/in_progress/completed/cancelled
  maxParticipants:integer("max_participants").default(5),
  startDate:     timestamp("start_date"),
  endDate:       timestamp("end_date"),
  createdBy:     uuid("created_by").references(() => users.id),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
})

export const projectApplications = pgTable("project_applications", {
  id:           uuid("id").primaryKey().defaultRandom(),
  projectId:    uuid("project_id").references(() => internalProjects.id, { onDelete: "cascade" }).notNull(),
  employeeId:   text("employee_id").notNull(),
  employeeName: text("employee_name"),
  department:   text("department"),
  motivation:   text("motivation"),
  matchScore:   integer("match_score"),           // 0-100 auto-calculated
  status:       text("status").default("pending"), // pending/accepted/rejected/withdrawn
  appliedAt:    timestamp("applied_at").defaultNow(),
  resolvedAt:   timestamp("resolved_at"),
}, (t) => [unique().on(t.projectId, t.employeeId)])

// ─── Блок J: AI-суперагент чат ──────────────────────────────────────────────

export const aiChatMessages = pgTable("ai_chat_messages", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id).notNull(),
  role:       text("role").notNull(),              // user/assistant
  content:    text("content").notNull(),
  sessionId:  text("session_id"),                  // группировка по сессиям
  metadata:   jsonb("metadata"),                   // { tokensUsed, model, tools? }
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Уведомления (реальные, из БД) ─────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tenantId:   uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:     uuid("user_id").references(() => users.id),  // null = для всех HR в тенанте
  type:       text("type").notNull(),                       // pulse_alert/flight_risk_alert/system/info
  title:      text("title").notNull(),
  body:       text("body"),
  severity:   text("severity").default("info"),             // info/warning/danger/success
  sourceType: text("source_type"),                          // pulse_response/flight_risk/retention_action
  sourceId:   text("source_id"),
  href:       text("href"),                                 // ссылка для перехода
  isRead:     boolean("is_read").default(false),
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Invite Links ─────────────────────────────────────────────────────────────

export const inviteLinks = pgTable("invite_links", {
  id:         uuid("id").primaryKey().defaultRandom(),
  companyId:  uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  createdBy:  uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  token:      text("token").unique().notNull(),
  role:       text("role").notNull(),           // director|hr_lead|hr_manager|department_head|observer
  label:      text("label"),                    // необязательное описание (напр. «Для Ани»)
  maxUses:    integer("max_uses").default(1),   // null = безлимит
  usesCount:  integer("uses_count").default(0),
  isActive:   boolean("is_active").default(true),
  expiresAt:  timestamp("expires_at"),          // null = бессрочно
  createdAt:  timestamp("created_at").defaultNow(),
})

// ─── Notification Preferences ────────────────────────────────────────────────

export const notificationPreferences = pgTable("notification_preferences", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  module:           text("module").notNull(),   // hr, marketing, sales, logistics, general
  category:         text("category").notNull(), // hiring, adaptation, pulse, flight_risk, courses, etc.
  channelEmail:     boolean("channel_email").default(true),
  channelTelegram:  boolean("channel_telegram").default(false),
  channelPush:      boolean("channel_push").default(false),
  channelWeb:       boolean("channel_web").default(true),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
}, (t) => [unique().on(t.userId, t.module, t.category)])

// ─── Integrators ──────────────────────────────────────────────────────────────

export const integratorLevels = pgTable("integrator_levels", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             text("name").notNull(),
  minClients:       integer("min_clients").default(0),
  minMrrKopecks:    integer("min_mrr_kopecks").default(0),
  commissionPercent:text("commission_percent").notNull(), // numeric as text
  sortOrder:        integer("sort_order").default(0),
  isActive:         boolean("is_active").default(true),
  createdAt:        timestamp("created_at").defaultNow(),
})

export const integrators = pgTable("integrators", {
  id:           uuid("id").primaryKey().defaultRandom(),
  companyId:    uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).unique().notNull(),
  levelId:      uuid("level_id").references(() => integratorLevels.id),
  contactName:  text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status:       text("status").default("active"), // active, suspended, terminated
  joinedAt:     timestamp("joined_at").defaultNow(),
  createdAt:    timestamp("created_at").defaultNow(),
})

export const integratorClients = pgTable("integrator_clients", {
  id:              uuid("id").primaryKey().defaultRandom(),
  integratorId:    uuid("integrator_id").references(() => integrators.id, { onDelete: "cascade" }).notNull(),
  clientCompanyId: uuid("client_company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  referredAt:      timestamp("referred_at").defaultNow(),
}, (t) => [unique().on(t.integratorId, t.clientCompanyId)])

export const integratorPayouts = pgTable("integrator_payouts", {
  id:               uuid("id").primaryKey().defaultRandom(),
  integratorId:     uuid("integrator_id").references(() => integrators.id, { onDelete: "cascade" }).notNull(),
  periodStart:      timestamp("period_start").notNull(),
  periodEnd:        timestamp("period_end").notNull(),
  totalMrrKopecks:  integer("total_mrr_kopecks").default(0),
  commissionPercent:text("commission_percent"),
  payoutKopecks:    integer("payout_kopecks").default(0),
  status:           text("status").default("pending"), // pending, approved, paid
  paidAt:           timestamp("paid_at"),
  createdAt:        timestamp("created_at").defaultNow(),
})

// ─── Calendar & Rooms ─────────────────────────────────────────────────────────

export const rooms = pgTable("rooms", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  name:      text("name").notNull(),
  capacity:  integer("capacity"),
  equipment: text("equipment").array(),
  floor:     text("floor"),
  isActive:  boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
})

export const calendarEvents = pgTable("calendar_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").references(() => companies.id).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  type:        text("type").notNull().default("meeting"), // meeting|interview|training|booking|other
  startAt:     timestamp("start_at", { withTimezone: true }).notNull(),
  endAt:       timestamp("end_at", { withTimezone: true }).notNull(),
  allDay:      boolean("all_day").default(false),
  roomId:      uuid("room_id").references(() => rooms.id),
  createdBy:   uuid("created_by").references(() => users.id).notNull(),
  color:       text("color"),
  recurrence:  text("recurrence"),
  status:      text("status").default("confirmed"), // confirmed|tentative|cancelled
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const calendarEventParticipants = pgTable("calendar_event_participants", {
  id:      uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }).notNull(),
  userId:  uuid("user_id").references(() => users.id).notNull(),
  status:  text("status").default("pending"), // pending|accepted|declined
}, (t) => [unique().on(t.eventId, t.userId)])

// ─── SMS Codes ────────────────────────────────────────────────────────────────

export const smsCodes = pgTable("sms_codes", {
  id:        uuid("id").primaryKey().defaultRandom(),
  phone:     text("phone").notNull(),
  code:      text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used:      boolean("used").default(false),
  attempts:  integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Billing ──────────────────────────────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id:            uuid("id").primaryKey().defaultRandom(),
  companyId:     uuid("company_id").references(() => companies.id).notNull(),
  number:        text("number").notNull().unique(),
  planId:        uuid("plan_id").references(() => plans.id),
  amountKopecks: bigint("amount_kopecks", { mode: "number" }).notNull(),
  status:        text("status").default("draft"), // 'draft'|'issued'|'paid'|'cancelled'
  issuedAt:      timestamp("issued_at", { withTimezone: true }),
  paidAt:        timestamp("paid_at", { withTimezone: true }),
  dueDate:       timestamp("due_date", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  pdfUrl:        text("pdf_url"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at").defaultNow(),
})

export const subscriptionHistory = pgTable("subscription_history", {
  id:          uuid("id").primaryKey().defaultRandom(),
  companyId:   uuid("company_id").references(() => companies.id).notNull(),
  planId:      uuid("plan_id").references(() => plans.id),
  status:      text("status").notNull(),
  startedAt:   timestamp("started_at", { withTimezone: true }).notNull(),
  expiresAt:   timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  reason:      text("reason"),
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── HH.ru Integration ────────────────────────────────────────────────────────

export const hhTokens = pgTable("hh_tokens", {
  id:             uuid("id").primaryKey().defaultRandom(),
  companyId:      uuid("company_id").references(() => companies.id).notNull().unique(),
  accessToken:    text("access_token").notNull(),
  refreshToken:   text("refresh_token").notNull(),
  expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
  hhEmployerId:   text("hh_employer_id"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

export const hhVacancies = pgTable("hh_vacancies", {
  id:           uuid("id").primaryKey().defaultRandom(),
  vacancyId:    uuid("vacancy_id").references(() => vacancies.id).notNull(),
  hhVacancyId:  text("hh_vacancy_id").notNull(),
  hhStatus:     text("hh_status").default("active"),
  publishedAt:  timestamp("published_at", { withTimezone: true }).defaultNow(),
  expiresAt:    timestamp("expires_at", { withTimezone: true }),
  views:        integer("views").default(0),
  responses:    integer("responses").default(0),
  updatedAt:    timestamp("updated_at").defaultNow(),
})

// ─── Vacancy UTM Links ───────────────────────────────────────────────────────

export const vacancyUtmLinks = pgTable("vacancy_utm_links", {
  id:              uuid("id").primaryKey().defaultRandom(),
  vacancyId:       uuid("vacancy_id").references(() => vacancies.id, { onDelete: "cascade" }).notNull(),
  source:          text("source").notNull(), // 'telegram' | 'whatsapp' | 'vk' | 'email' | 'site' | 'qr' | 'agency' | 'other'
  name:            text("name").notNull(),
  slug:            text("slug").unique().notNull(),
  destinationUrl:  text("destination_url"),
  clicks:          integer("clicks").default(0),
  candidatesCount: integer("candidates_count").default(0),
  createdAt:       timestamp("created_at").defaultNow(),
})

export const hhCandidates = pgTable("hh_candidates", {
  id:              uuid("id").primaryKey().defaultRandom(),
  candidateId:     uuid("candidate_id").references(() => candidates.id).notNull(),
  hhResumeId:      text("hh_resume_id").notNull().unique(),
  hhApplicationId: text("hh_application_id"),
  importedAt:      timestamp("imported_at").defaultNow(),
})

// ─── Knowledge Base ─────────────────────────────────────────────────────────

export const knowledgeCategories = pgTable("knowledge_categories", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:        text("name").notNull(),
  slug:        text("slug"),
  description: text("description"),
  icon:        text("icon"),
  sortOrder:   integer("sort_order").default(0),
  parentId:    uuid("parent_id"),
  status:      text("status").default("active"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

export const knowledgeArticles = pgTable("knowledge_articles", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  categoryId:  uuid("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
  title:       text("title").notNull(),
  slug:        text("slug"),
  content:     text("content"),
  excerpt:     text("excerpt"),
  authorId:    uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  viewsCount:  integer("views_count").default(0),
  isPinned:    boolean("is_pinned").default(false),
  status:      text("status").default("published"), // draft | review | review_changes | published | archived
  reviewerId:  uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  tags:        text("tags").array(),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── AI Course Projects ──────────────────────────────────────────────────────

export const aiCourseProjects = pgTable("ai_course_projects", {
  id:               uuid("id").primaryKey().defaultRandom(),
  tenantId:         uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:            text("title").notNull(),
  description:      text("description"),
  status:           text("status").default("draft"),            // draft | generating | ready | published
  sources:          jsonb("sources").default([]),                // [{type, title, content, url?}]
  params:           jsonb("params"),                             // {audience, format, tone, withTests, withSummary}
  result:           jsonb("result"),                             // generated course structure
  publishedCourseId: uuid("published_course_id").references(() => courses.id, { onDelete: "set null" }),
  tokensInput:      integer("tokens_input").default(0),
  tokensOutput:     integer("tokens_output").default(0),
  costUsd:          text("cost_usd").default("0"),              // numeric as text
  createdBy:        uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
})

export const aiUsageLog = pgTable("ai_usage_log", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action:       text("action").notNull(),                       // course_generate | course_regenerate
  projectId:    uuid("project_id").references(() => aiCourseProjects.id, { onDelete: "cascade" }),
  inputTokens:  integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model:        text("model"),
  costUsd:      text("cost_usd").default("0"),
  createdAt:    timestamp("created_at").defaultNow(),
})

// Reviews / comments on knowledge articles
export const knowledgeReviews = pgTable("knowledge_reviews", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  articleId:   uuid("article_id").references(() => knowledgeArticles.id, { onDelete: "cascade" }).notNull(),
  authorId:    uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  action:      text("action").notNull(), // comment | approve | request_changes
  comment:     text("comment"),           // текстовый комментарий
  voiceUrl:    text("voice_url"),         // URL голосового сообщения
  videoUrl:    text("video_url"),         // URL видеозаписи с объяснениями
  attachments: text("attachments").array(), // доп. файлы / скриншоты
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Access Requests (заявки на подключение) ─────────────────────────────────

export const accessRequests = pgTable("access_requests", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  phone:       text("phone"),
  companyName: text("company_name"),
  comment:     text("comment"),
  status:      text("status").default("new"),   // new | contacted | approved | rejected
  createdAt:   timestamp("created_at").defaultNow(),
})

// ─── Task Projects ───────────────────────────────────────────────────────────

export const taskProjects = pgTable("task_projects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  status:      text("status").default("active"),     // planning | active | paused | completed | archived
  color:       text("color").default("#378ADD"),
  icon:        text("icon"),
  deadline:    timestamp("deadline"),
  ownerId:     uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  templateId:  uuid("template_id"),
  progress:    integer("progress").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id:             uuid("id").primaryKey().defaultRandom(),
  tenantId:       uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  projectId:      uuid("project_id").references(() => taskProjects.id, { onDelete: "set null" }),
  parentId:       uuid("parent_id"),                   // self-ref for subtasks
  title:          text("title").notNull(),
  description:    text("description"),
  status:         text("status").default("todo"),      // todo | in_progress | review | done | cancelled
  priority:       text("priority").default("medium"),  // urgent | high | medium | low
  assigneeId:     uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  creatorId:      uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
  source:         text("source").default("manual"),    // manual | ai | crm | hr | knowledge
  sourceId:       uuid("source_id"),
  tags:           text("tags").array(),
  deadline:       timestamp("deadline"),
  startedAt:      timestamp("started_at"),
  completedAt:    timestamp("completed_at"),
  estimatedHours: text("estimated_hours"),             // numeric as text
  actualHours:    text("actual_hours"),
  progress:       integer("progress").default(0),
  sortOrder:      integer("sort_order").default(0),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
})

// ─── Task Comments ───────────────────────────────────────────────────────────

export const taskComments = pgTable("task_comments", {
  id:        uuid("id").primaryKey().defaultRandom(),
  taskId:    uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Task Activity Log ───────────────────────────────────────────────────────

export const taskActivityLog = pgTable("task_activity_log", {
  id:        uuid("id").primaryKey().defaultRandom(),
  taskId:    uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action:    text("action").notNull(),               // created | status_changed | assigned | commented | completed | deadline_changed
  oldValue:  text("old_value"),
  newValue:  text("new_value"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Visit Log ───────────────────────────────────────────────────────────────

export const visitLog = pgTable("visit_log", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  tenantId:  uuid("tenant_id"),
  sessionId: text("session_id"),
  page:      text("page").notNull(),
  ip:        text("ip"),
  userAgent: text("user_agent"),
  referrer:  text("referrer"),
  createdAt: timestamp("created_at").defaultNow(),
})

// ─── Custom Skills / Items ───────────────────────────────────────────────────

export const customSkills = pgTable("custom_skills", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:      text("name").notNull(),
  type:      text("type").notNull().default("skill"), // 'skill' | 'condition' | 'stop_factor' | 'parameter'
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.companyId, t.name, t.type)])

// ─── Custom Vacancy Categories ───────────────────────────────────────────────

export const customVacancyCategories = pgTable("custom_vacancy_categories", {
  id:        uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [unique().on(t.companyId, t.name)])

// ─── User Sessions (online tracking) ────────────────────────────────────────

export const userSessions = pgTable("user_sessions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tenantId:     uuid("tenant_id"),
  startedAt:    timestamp("started_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  lastPage:     text("last_page"),
  ip:           text("ip"),
  userAgent:    text("user_agent"),
  isOnline:     boolean("is_online").default(true),
})

// ─── Demo Templates & Vacancy Demos ──────────────────────────────────────────

export const demoTemplates = pgTable("demo_templates", {
  id:            uuid("id").primaryKey().defaultRandom(),
  tenantId:      uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  niche:         text("niche").notNull().default("universal"),
  length:        text("length").notNull().default("standard"),
  isSystem:      boolean("is_system").default(false),
  sections:      jsonb("sections").notNull().default("[]"),
  variablesUsed: jsonb("variables_used").default("[]"),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
})

export const vacancyDemos = pgTable("vacancy_demos", {
  id:          uuid("id").primaryKey().defaultRandom(),
  vacancyId:   uuid("vacancy_id").references(() => vacancies.id, { onDelete: "cascade" }).notNull(),
  templateId:  uuid("template_id").references(() => demoTemplates.id),
  name:        text("name").notNull(),
  status:      text("status").notNull().default("draft"),
  sections:    jsonb("sections").notNull().default("[]"),
  settings:    jsonb("settings").default("{}"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
})
