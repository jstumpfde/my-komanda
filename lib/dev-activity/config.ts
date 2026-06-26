// Конфигурация трекера dev-активности.
//
// Следим за несколькими ПРОЕКТАМИ; у каждого свои репозитории и (опц.) свой
// сервер. Сбор идёт по SSH (read-only) либо локально (если репо на том же боксе,
// где крутится крон). Доступ к серверу Маркет Радара — ключ marketradar_ed25519.

import os from "os"
import path from "path"

export interface RepoConfig {
  /** Машинный ключ репо (без пробелов). */
  key:   string
  /** Человеческий ярлык для UI. */
  label: string
  /** Абсолютный путь к рабочему дереву на сервере. */
  path:  string
}

export interface SshConfig {
  host:    string
  user:    string
  keyPath: string
}

export interface ProjectConfig {
  /** Машинный ключ проекта (без пробелов) — он же ключ строк в БД. */
  key:    string
  /** Заголовок таба. */
  label:  string
  /** Кого показываем как исполнителя (контекст для AI-разбора). */
  person: string
  /** SSH-доступ к серверу проекта; null = репозитории на том же боксе (локально). */
  ssh:    SshConfig | null
  /** Репозитории проекта. Дев-каталоги раньше деплой-чекаутов — для дедупа по SHA. */
  repos:  RepoConfig[]
}

// Ключ marketradar_ed25519 у текущего пользователя: на Mac → /Users/juri/.ssh,
// на проде под root → /root/.ssh.
const MARKETRADAR_KEY = process.env.DEV_ACTIVITY_SSH_KEY
  ?? path.join(os.homedir(), ".ssh", "marketradar_ed25519")

export const PROJECTS: ProjectConfig[] = [
  {
    key:    "market-radar",
    label:  "Маркет Радар",
    person: "Мария",
    ssh:    { host: process.env.DEV_ACTIVITY_MR_HOST ?? "72.56.241.159", user: "root", keyPath: MARKETRADAR_KEY },
    repos: [
      { key: "marketradar-leadgen",  label: "Leadgen",      path: "/home/maria/marketradar-leadgen" },
      { key: "call-agent",           label: "Call-agent",   path: "/home/maria/call-agent" },
      { key: "marketradar-parser",   label: "Parser",       path: "/home/maria/marketradar-parser" },
      { key: "market-radar-bot",     label: "Bot",          path: "/home/maria/market-radar-bot" },
      { key: "market-radar",         label: "Market Radar", path: "/var/www/market-radar" },
      { key: "market-radar-staging", label: "MR staging",   path: "/var/www/market-radar-staging" },
    ],
  },
  {
    key:    "company24",
    label:  "Company24Pro",
    person: "команда Company24",
    ssh:    null,   // репозитории на том же сервере, где крутится крон (прод)
    repos: [
      { key: "my-komanda",         label: "Company24",    path: "/var/www/my-komanda" },
      { key: "my-komanda-staging", label: "C24 staging",  path: "/var/www/my-komanda-new-staging" },
    ],
  },
]

export function getProject(key: string): ProjectConfig | undefined {
  return PROJECTS.find(p => p.key === key)
}

// Сколько дней истории тянуть из git за один сбор. Окно нормы — 28 дней, с запасом.
export const LOOKBACK_DAYS = 35

// Сколько последних календарных дней гарантированно показываем (вкл. «тихие» дни).
export const WINDOW_DAYS = 30
