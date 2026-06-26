// Сбор активности по SSH (read-only). Один заход на сервер, по каждому репо
// тянем: коммиты за окно (sha, день, тема, +/- строк, файлы), число
// незакоммиченных файлов и коммитов впереди upstream.
//
// Ничего на сервере не меняем и не ставим. git вызываем с safe.directory=*,
// потому что заходим под root, а репо принадлежат другому пользователю.

import { execFile } from "child_process"
import { promisify } from "util"
import { LOOKBACK_DAYS, type ProjectConfig, type RepoConfig } from "./config"
import type { CollectResult, RepoSnapshot, RawCommit } from "./types"

const execFileAsync = promisify(execFile)

// Маркеры секций — маловероятны в выводе git, ловим их в начале строки.
function buildRemoteScript(repos: RepoConfig[]): string {
  const entries = repos.map(r => `${r.key}::${r.path}`).join(" ")
  return `
REPOS="${entries}"
for entry in $REPOS; do
  key="\${entry%%::*}"
  dir="\${entry##*::}"
  [ -d "$dir/.git" ] || continue
  G="git -c safe.directory=* -C $dir"
  echo "@@@REPO $key"
  echo "@@@REMOTE $($G config --get remote.origin.url 2>/dev/null)"
  echo "@@@BRANCH $($G rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "@@@WIP $($G status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "@@@UNPUSHED $($G log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')"
  echo "@@@LOG"
  $G log --since="${LOOKBACK_DAYS} days ago" --date=format-local:%Y-%m-%d --pretty=format:"COMMIT|%H|%ad|%aI|%s" --numstat 2>/dev/null
  echo ""
  echo "@@@ENDREPO"
done
`.trim()
}

function num(s: string | undefined): number {
  const n = parseInt((s ?? "").trim(), 10)
  return Number.isFinite(n) ? n : 0
}

// Сгенерированные/вендоренные файлы не считаем за «работу» — иначе один
// удалённый lock-файл даёт −700k строк и метрика теряет смысл.
const GENERATED = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|composer\.lock|go\.sum)$/,
  /\.tsbuildinfo$/,
  /\.(min\.(js|css)|map)$/,
  /(^|\/)(dist|build|out|coverage|vendor|\.next|node_modules)\//,
]
function isGenerated(file: string): boolean {
  return GENERATED.some(re => re.test(file))
}

export function parseCollectOutput(stdout: string, repoCfgs: RepoConfig[]): RepoSnapshot[] {
  const byKey = new Map(repoCfgs.map(r => [r.key, r]))
  const repos: RepoSnapshot[] = []
  let cur: RepoSnapshot | null = null
  let inLog = false
  let commit: RawCommit | null = null

  const flushCommit = () => {
    if (cur && commit) cur.commits.push(commit)
    commit = null
  }

  for (const line of stdout.split("\n")) {
    if (line.startsWith("@@@REPO ")) {
      flushCommit()
      if (cur) repos.push(cur)
      const key = line.slice("@@@REPO ".length).trim()
      const cfg = byKey.get(key)
      cur = {
        key,
        label:    cfg?.label ?? key,
        path:     cfg?.path ?? "",
        remote:   null,
        branch:   null,
        wipFiles: 0,
        unpushed: 0,
        commits:  [],
      }
      inLog = false
      continue
    }
    if (!cur) continue
    if (line.startsWith("@@@REMOTE "))   { cur.remote = line.slice("@@@REMOTE ".length).trim() || null; continue }
    if (line.startsWith("@@@BRANCH "))   { cur.branch = line.slice("@@@BRANCH ".length).trim() || null; continue }
    if (line.startsWith("@@@WIP "))      { cur.wipFiles = num(line.slice("@@@WIP ".length)); continue }
    if (line.startsWith("@@@UNPUSHED ")) { cur.unpushed = num(line.slice("@@@UNPUSHED ".length)); continue }
    if (line.startsWith("@@@LOG"))       { inLog = true; continue }
    if (line.startsWith("@@@ENDREPO"))   { flushCommit(); inLog = false; continue }
    if (!inLog) continue

    if (line.startsWith("COMMIT|")) {
      flushCommit()
      const rest = line.slice("COMMIT|".length).split("|")
      commit = {
        sha:     rest[0] ?? "",
        day:     rest[1] ?? "",
        at:      rest[2] ?? "",          // ISO-время коммита (с tz сервера, +03:00)
        subject: rest.slice(3).join("|"),
        added:   0,
        removed: 0,
        files:   0,
      }
      continue
    }
    // numstat: "<added>\t<removed>\t<file>" ('-' для бинарников)
    if (commit && line.includes("\t")) {
      const [a, r, ...fileParts] = line.split("\t")
      const file = fileParts.join("\t")
      if (isGenerated(file)) continue   // lock-файлы, билд-артефакты — не работа
      commit.added   += a === "-" ? 0 : num(a)
      commit.removed += r === "-" ? 0 : num(r)
      commit.files   += 1
    }
  }
  flushCommit()
  if (cur) repos.push(cur)
  return repos
}

export async function collect(project: ProjectConfig): Promise<CollectResult> {
  const script = buildRemoteScript(project.repos)
  const opts = { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 }

  let stdout: string
  if (project.ssh) {
    const { host, user, keyPath } = project.ssh
    const args = [
      "-i", keyPath,
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=accept-new",
      `${user}@${host}`,
      script,
    ]
    ;({ stdout } = await execFileAsync("ssh", args, opts))
  } else {
    // Локальный режим: репозитории на том же боксе, что и крон.
    ;({ stdout } = await execFileAsync("bash", ["-c", script], opts))
  }

  return {
    project:     project.key,
    collectedAt: new Date().toISOString(),
    repos:       parseCollectOutput(stdout, project.repos),
  }
}
