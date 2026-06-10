# CHANGELOG

## 22.05.2026 (18 deploys, ~100 commits)

### Major Features

- AI chatbot with multi-layer security (executor + pre/post filter + watcher)
- Visual funnel builder with 17 blocks (drag-and-drop, settings in Sheet)
- Per-vacancy stop factors with auto-application in hh process queue
- Platform Admin section (/admin/platform) with 6 tabs
- Emergency broadcast endpoints for platform-wide operations
- Settings migrations system (idempotent runner)
- Funnel templates: built-in + company-level + platform-level
- Templates mining from existing vacancies
- Public vacancy page with proper typography
- Enhanced abuse filter (sensitivity + action selection + undo)

### Database Migrations

0118-0131 (14 migrations) — ai chatbot, funnel builder, stop factors, platform settings, templates

### Infrastructure

- Dual-write for backward compatibility
- Multi-tenant isolation by company_id
- Hidden admin sections with whitelist + 404 protection
- Kill switches at vacancy / company / platform levels
