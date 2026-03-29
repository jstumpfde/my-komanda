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
