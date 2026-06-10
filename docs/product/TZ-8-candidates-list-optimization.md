# ТЗ-8: Оптимизация скорости списка /hr/candidates

**Цель:** Сделать список кандидатов быстрым даже при 500+ кандидатах.
**Оценка:** 30-45 минут.

---

## КОНТЕКСТ

Сейчас на странице /hr/candidates у пользователя ~116 кандидатов в БД,
будет 250+ после рассылки. При листании / поиске / сортировке возможны
тормоза. Нужно подготовиться.

ТЗ-7 уже закоммичено (2bc5a07). Не трогать candidate-drawer.tsx и
/api/modules/hr/candidates/[id]/route.ts — это зона ТЗ-7.

---

## ЗАДАЧИ

### 1. ИЗМЕРЕНИЕ ТЕКУЩЕГО СОСТОЯНИЯ

Перед оптимизацией изучи endpoint:
  app/api/modules/hr/candidates/route.ts (GET, не [id])

Опиши в финальном отчёте:
- Есть ли LIMIT в запросе?
- Грузим ли мы тяжёлые JSON-поля (full_resume, demo_progress_json,
  anketa_answers) для каждой строки списка?
- Есть ли пагинация (offset, cursor)?
- Сколько JOIN'ов?
- Есть ли N+1 паттерн внутри обогащения?

### 2. СЕРВЕРНАЯ ПАГИНАЦИЯ

Файл: app/api/modules/hr/candidates/route.ts (GET)

- Принимать query-параметры: ?page=1&pageSize=50
- Дефолт: pageSize=50, page=1, max pageSize=100
- Возвращать: { items: [], total: number, page, pageSize, hasMore: boolean }
- В SELECT убрать тяжёлые поля для списка: full_resume, demo_progress_json,
  anketa_answers (они нужны только в Drawer, не в списке)
- Оставить только лёгкие колонки: id, name, stage, photo_url, ai_score,
  ai_summary, progress_percent, is_favorite, hh_application_id,
  created_at, updated_at, vacancy_id, vacancy_name (через JOIN)

### 3. INFINITE SCROLL ИЛИ ПАГИНАЦИЯ В UI

Файл: app/(modules)/hr/candidates/page.tsx или похожий список.

Простой вариант: пагинация по 50 с кнопкой «Загрузить ещё» внизу списка.
Реализуй через accumulation:
  const [items, setItems] = useState<Candidate[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    const res = await fetch('/api/modules/hr/candidates?page=' + (page + 1));
    const data = await res.json();
    setItems(prev => [...prev, ...data.items]);
    setPage(p => p + 1);
    setHasMore(data.hasMore);
  };

### 4. ДЕБАУНС ПОИСКА

Если в списке есть search input — добавь debounce 300мс на запрос.
Если useDebounce hook нет в проекте — НЕ ДОБАВЛЯЙ библиотеку,
напиши простой:

  function useDebounce<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), ms);
      return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
  }

### 5. ИНДЕКСЫ БД

Создай миграцию drizzle/0081_candidates_list_indexes.sql:

  CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(stage);
  CREATE INDEX IF NOT EXISTS idx_candidates_is_favorite ON candidates(is_favorite) WHERE is_favorite = true;
  CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_candidates_ai_score ON candidates(ai_score DESC NULLS LAST);

ВАЖНО: idx_candidates_vacancy_id уже создан в ТЗ-7 (миграция 0080),
не дублируй.

НЕ применяй миграцию — только создай SQL-файл.

### 6. ОПТИМИСТИЧНЫЙ UI ДЛЯ FAVORITE

Сейчас при клике на звёздочку: запрос → ждём ответ → обновляем UI.
Должно быть: клик → сразу обновляем UI → запрос в фоне → откат на ошибке.

Файл с обработчиком favorite найди:
  grep -rn "is_favorite\|isFavorite\|favorite" components/candidates --include="*.tsx" -l

Реализуй паттерн optimistic update:

  const handleToggleFavorite = async (candidateId: string) => {
    setCandidates(prev => prev.map(c =>
      c.id === candidateId ? { ...c, isFavorite: !c.isFavorite } : c
    ));
    try {
      await fetch('/api/modules/hr/candidates/' + candidateId + '/favorite', {
        method: 'POST'
      });
    } catch (err) {
      setCandidates(prev => prev.map(c =>
        c.id === candidateId ? { ...c, isFavorite: !c.isFavorite } : c
      ));
      toast.error('Не удалось обновить избранное');
    }
  };

### 7. ПРОВЕРКА N+1

В app/api/modules/hr/candidates/route.ts проверь нет ли цикла где для
каждого кандидата делается отдельный запрос:

  for (const c of candidates) {
    const hhData = await db.select()...  // плохо
  }

Должно быть один JOIN или batch через inArray:

  const allHhData = await db.select()
    .from(hhResponses)
    .where(inArray(hhResponses.localCandidateId, candidates.map(c => c.id)));

  const byCandidate = Object.fromEntries(allHhData.map(d => [d.localCandidateId, d]));

  return candidates.map(c => ({ ...c, hh: byCandidate[c.id] }));

---

## ЧЕГО НЕ ДЕЛАТЬ

- Не добавлять react-virtual или react-window
- Не переписывать вёрстку списка
- Не трогать candidate-drawer.tsx и /api/modules/hr/candidates/[id]/route.ts
  (это зона ТЗ-7)
- Не добавлять react-query / swr
- Не запускать pnpm build, только pnpm tsc --noEmit

## ПРОВЕРКИ
  pnpm tsc --noEmit 2>&1 | head -30
  pnpm lint 2>&1 | head -30

## ГОТОВНОСТЬ
Когда всё готово — напиши «ТЗ-8 готово» и перечисли:
1. Что было до (размер ответа API, время если измерял через консоль)
2. Что стало после (предполагаемая разница)
3. Изменённые файлы
4. SQL-миграция для применения
5. Известные TODO

Закоммить и запушь в main.
