export const meta = {
  name: 'predeploy-guard',
  description: 'Надзор перед прод-деплоем: ревью diff против PRODUCT-STANDARDS (DoD + инварианты + макет), адверс-верификация находок',
  whenToUse: 'Запускать перед КАЖДЫМ прод-деплоем нетривиального изменения my-komanda. args = строка-контекст (что меняли / какой макет/договорённость), необязательно.',
  phases: [
    { title: 'Review' },
    { title: 'Verify' },
  ],
}

const ROOT = '/Users/juri/Projects/my-komanda'
const CTX = typeof args === 'string' && args.trim() ? args.trim() : '(контекст не передан — выведи из самого diff)'

const COMMON = `Проект my-komanda (Company24.pro), HR SaaS. Рабочее дерево — UNCOMMITTED изменения перед прод-деплоем.
Сначала прочитай ЭТАЛОН и diff:
  cat ${ROOT}/docs/architecture/PRODUCT-STANDARDS.md
  git -C ${ROOT} diff
Контекст задачи от координатора: ${CTX}
Оценивай ТОЛЬКО изменённый код. Возвращай реальные дефекты, не стилистику.`

const FIND_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { findings: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' }, file: { type: 'string' }, lines: { type: 'string' },
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      detail: { type: 'string' }, fix: { type: 'string' },
    }, required: ['title', 'file', 'lines', 'severity', 'detail', 'fix'],
  } } }, required: ['findings'],
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    isReal: { type: 'boolean' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'not-a-bug'] },
    reasoning: { type: 'string' },
  }, required: ['isReal', 'severity', 'reasoning'],
}

const LENSES = [
  { key: 'invariants', prompt: `${COMMON}

ЛИНЗА 1 — ИНВАРИАНТЫ «НЕ ЛОМАТЬ» (§3 эталона). Проверь СТРОГО по коду:
- Legacy/существующее байт-в-байт? Флаги default-OFF не меняют поведение старых вакансий/Орлинка?
- Ничего не теряется при импорте/переносе (все поля доходят)?
- Нет мёртвого UI (кнопка/поле без рабочего эффекта)?
- Устаревшие model id (claude-sonnet-4-20250514, claude-sonnet-4-5, старые opus)? Грепни.
- Юр-чувствительное (ОВЗ/возраст/гражданство/тексты отказа) не ставится ложно?
Верни реальные нарушения инвариантов.` },
  { key: 'done', prompt: `${COMMON}

ЛИНЗА 2 — DEFINITION OF DONE + КОРРЕКТНОСТЬ (§2 эталона). Проверь:
- Сделано ЦЕЛИКОМ под задачу/договорённость, не половина?
- Логические баги, краши, рантайм-ошибки (битый импорт/scope/undefined — Turbopack их не ловит)?
- e2e-цепочка UI→API→данные согласована (новые поля во всех местах чтения/записи)?
Верни реальные дефекты корректности/неполноты.` },
  { key: 'agreement', prompt: `${COMMON}

ЛИНЗА 3 — СОВПАДЕНИЕ С СОГЛАСОВАННЫМ (§4,§7 эталона). Проверь:
- Изменение соответствует согласованному макету/договорённости (если в контексте назван макет — сверь),
  а не «похоже»/косметика поверх старого?
- UI честен (лейблы/подписи отражают реальное поведение движка)?
- Тексты/смысл для кандидата не деградировали (продающий смысл сохранён)?
Верни реальные расхождения с договорённостью.` },
]

const results = await pipeline(
  LENSES,
  l => agent(l.prompt, { label: `guard:${l.key}`, phase: 'Review', schema: FIND_SCHEMA }),
  (review, lens) => parallel((review?.findings ?? []).map(f => () =>
    agent(`${COMMON}\n\nАдверсариально ПРОВЕРЬ заявленный дефект по реальному коду. Не воспроизводится → isReal=false. Будь скептиком, но точным.\n[${lens.key}] ${f.title}\n${f.file}:${f.lines} (${f.severity})\n${f.detail}\nФикс: ${f.fix}`,
      { label: `verify:${f.file}:${f.lines}`, phase: 'Verify', schema: VERDICT_SCHEMA })
      .then(v => ({ ...f, lens: lens.key, verdict: v }))))
)

const confirmed = results.flat().filter(Boolean)
  .filter(f => f.verdict?.isReal && f.verdict?.severity !== 'not-a-bug')
  .sort((a, b) => ({ blocker: 0, major: 1, minor: 2 }[a.verdict.severity] ?? 3) - ({ blocker: 0, major: 1, minor: 2 }[b.verdict.severity] ?? 3))

const blockers = confirmed.filter(f => f.verdict.severity === 'blocker' || f.verdict.severity === 'major')
return {
  verdict: blockers.length === 0 ? 'CLEAR — можно деплоить' : 'STOP — есть major/blocker, чинить до деплоя',
  blockersAndMajors: blockers,
  minors: confirmed.filter(f => f.verdict.severity === 'minor'),
  totalChecked: results.flat().filter(Boolean).length,
}
