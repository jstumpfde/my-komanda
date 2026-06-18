import { eq, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"

// Полное (необратимое) удаление компании вместе со ВСЕМ тенантом.
//
// На companies.id (и транзитивно — на users.id, vacancies.id, candidates.id и
// т.д.) ссылается ~110 FK по всей схеме. Часть с ON DELETE CASCADE/SET NULL —
// БД уберёт их сама при удалении родителя. Но десятки FK заведены как
// NO ACTION/RESTRICT — они БЛОКИРУЮТ удаление, пока в дочерней таблице есть
// ссылающиеся строки. Прежний код хардкодил лишь 5 таких блокеров, поэтому
// «Удалить навсегда» и cron trash-cleanup падали на любой компании с данными.
//
// Здесь блокеры НЕ хардкодятся: граф блокирующих FK читается из системного
// каталога ИМЕННО ЭТОЙ базы (pg_constraint), поэтому дрейф схемы между
// окружениями исключён — набор таблиц/колонок всегда соответствует реальной
// БД. По графу выполняется рекурсивный каскад «от листьев к корню»: для каждой
// таблицы сначала чистятся её блокирующие дети (через join обратно к удаляемым
// строкам компании), и только потом — она сама. Так удаление идёт в корректном
// топологическом порядке без ошибок 23503, на любой глубине (company → vacancy
// → candidate → hh_candidate, company → users → user-deps и т.п.).
//
// Всё выполняется в ОДНОЙ транзакции: либо тенант удалён целиком, либо (при
// остаточном непредвиденном FK) откат и deleted:false — вызвавший (cron/endpoint)
// обработает мягко, частично выпотрошенной компании не остаётся. Идемпотентно:
// повторный вызов на уже удалённой компании возвращает deleted:true.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const IDENT_RE = /^[a-z_][a-z0-9_]*$/

// Имена таблиц/колонок приходят из системного каталога (доверенный источник),
// но всё равно валидируем перед вставкой как raw-идентификатор — на случай
// будущих экзотических имён и чтобы исключить любую инъекцию.
function ident(name: string): SQL {
  if (!IDENT_RE.test(name)) {
    throw new Error(`[hardDeleteCompany] небезопасный идентификатор из каталога: ${name}`)
  }
  return sql.raw(`"${name}"`)
}

interface FkEdge {
  childTable: string
  childCol:   string
  parentCol:  string
}

// Граф блокирующих FK: parentTable → список рёбер (child.childCol → parent.parentCol)
// с правилом удаления NO ACTION ('a') или RESTRICT ('r'). CASCADE/SET NULL/SET
// DEFAULT не блокируют delete и в граф не попадают (БД отработает их сама).
async function loadBlockingFkGraph(tx: Tx): Promise<Map<string, FkEdge[]>> {
  const rows = (await tx.execute(sql`
    SELECT
      pc_parent.relname AS parent_table,
      pc_child.relname  AS child_table,
      a_child.attname   AS child_col,
      a_parent.attname  AS parent_col
    FROM pg_constraint con
    JOIN pg_class pc_child  ON pc_child.oid  = con.conrelid
    JOIN pg_class pc_parent ON pc_parent.oid = con.confrelid
    JOIN pg_namespace ns    ON ns.oid = pc_child.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute a_child  ON a_child.attrelid  = con.conrelid  AND a_child.attnum  = con.conkey[1]
    JOIN pg_attribute a_parent ON a_parent.attrelid = con.confrelid AND a_parent.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND con.confdeltype IN ('a', 'r')     -- a = NO ACTION, r = RESTRICT
      AND array_length(con.conkey, 1) = 1   -- одиночные FK (составных в схеме нет)
  `)) as unknown as Array<{
    parent_table: string; child_table: string; child_col: string; parent_col: string
  }>

  const graph = new Map<string, FkEdge[]>()
  for (const r of rows) {
    const edge: FkEdge = { childTable: r.child_table, childCol: r.child_col, parentCol: r.parent_col }
    const list = graph.get(r.parent_table)
    if (list) list.push(edge)
    else graph.set(r.parent_table, [edge])
  }
  return graph
}

// Рекурсивно удаляет строки таблицы `table`, отобранные условием `filter`
// (в терминах колонок самой `table`). Перед удалением самой таблицы чистит всех
// её блокирующих детей — каждого через join обратно к удаляемым строкам `table`.
async function cascadeDelete(
  tx:     Tx,
  table:  string,
  filter: SQL,
  graph:  Map<string, FkEdge[]>,
  path:   Set<string>,
  depth:  number,
): Promise<void> {
  if (depth > 30) {
    throw new Error(`[hardDeleteCompany] превышена глубина каскада на таблице ${table} (цикл FK?)`)
  }
  for (const e of graph.get(table) ?? []) {
    if (e.childTable === table) continue   // саморефы в схеме только SET NULL/CASCADE — не блокируют
    if (path.has(e.childTable)) continue   // защита от циклов в графе FK
    const childFilter = sql`${ident(e.childCol)} IN (SELECT ${ident(e.parentCol)} FROM ${ident(table)} WHERE ${filter})`
    const nextPath = new Set(path)
    nextPath.add(table)
    await cascadeDelete(tx, e.childTable, childFilter, graph, nextPath, depth + 1)
  }
  await tx.execute(sql`DELETE FROM ${ident(table)} WHERE ${filter}`)
}

export interface HardDeleteCompanyResult {
  deleted:   boolean
  vacancies: number
  error?:    string
}

export async function hardDeleteCompany(companyId: string): Promise<HardDeleteCompanyResult> {
  try {
    return await db.transaction(async (tx) => {
      // Идемпотентность: компании уже нет — считаем успехом (повтор крона/вызова).
      const exists = (await tx.execute(
        sql`SELECT 1 FROM companies WHERE id = ${companyId} LIMIT 1`,
      )) as unknown as unknown[]
      if (exists.length === 0) return { deleted: true, vacancies: 0 }

      // Счётчик вакансий — для лога/ответа эндпоинта.
      const vacRows = (await tx.execute(
        sql`SELECT count(*)::int AS c FROM vacancies WHERE company_id = ${companyId}`,
      )) as unknown as Array<{ c: number }>
      const vacancyCount = Number(vacRows[0]?.c ?? 0)

      const graph = await loadBlockingFkGraph(tx)

      // Чистим блокирующие поддеревья всех прямых детей компании. cascadeDelete
      // сам спускается до листьев (кандидаты, hh_candidates, user-deps, …).
      const companyFilter = sql`id = ${companyId}`
      for (const e of graph.get("companies") ?? []) {
        const childFilter = sql`${ident(e.childCol)} IN (SELECT ${ident(e.parentCol)} FROM companies WHERE ${companyFilter})`
        await cascadeDelete(tx, e.childTable, childFilter, graph, new Set(["companies"]), 1)
      }

      // Сама компания — оставшиеся CASCADE/SET NULL дети уберутся/обнулятся БД.
      const deleted = await tx
        .delete(companies)
        .where(eq(companies.id, companyId))
        .returning({ id: companies.id })

      return { deleted: deleted.length > 0, vacancies: vacancyCount }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[hardDeleteCompany] каскадное удаление не удалось:", companyId, msg)
    return { deleted: false, vacancies: 0, error: msg }
  }
}
