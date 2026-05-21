# P0-50 deferred: sticky save bar для AutomationSettings + branding-save

**Дата отсрочки:** 2026-05-21
**Ветка где остановились:** `feature/p0-mega-fixes-may21`
**Что уже подключено к sticky-bar:** `PostDemoSettings`, `VacancyAiProcessSettings`, `VacancyPrequalificationSettings`, `VacancyFollowupSettings`, `VacancyScheduleSettings`, `MiniFormBuilder`.

**Что остаётся:** `AutomationSettings` (в 3 табах, 4 save-функции) и `saveBranding` в `app/(modules)/hr/vacancies/[id]/page.tsx`.

---

## 1. `components/vacancies/automation-settings.tsx`

### Текущее состояние

Один компонент рендерится в 3 разных табах страницы вакансии с разными `sections`:

| Где используется (page.tsx) | tabKey   | sections                                              |
|-----------------------------|----------|-------------------------------------------------------|
| Таб «Сообщения»             | messages | `["firstMessage", "callIntent", "templates"]`         |
| Таб «Демо и воронка»        | funnel   | `["pipeline"]`                                        |
| Таб «Интеграции»            | integrations | `["dialer"]`                                      |

Save-функций внутри компонента **четыре**:

1. **`saveInviteMessage`** (lines ~134-150): PATCH `/api/modules/hr/vacancies/[id]/ai-settings` с `{ inviteMessage }`. Триггерится из секции "firstMessage".
2. **`saveReInviteMessage`** (lines ~152-168): то же, но `{ reInviteMessage }`. Тоже из "firstMessage".
3. **Inline PATCH на pipeline** (line ~279): один из save-handlers внутри pipeline-секции.
4. **`saveSettings`** (lines ~346-402): PUT `/api/modules/hr/vacancies/[id]` с `description_json: { automation, faq }` — общий save для всего остального (callIntent, templates, anketa-confirmation, dialer, completenessCheck и т.д.).

### Сложности

- **Один компонент → 3 инстанса в разных табах.** При регистрации `sectionKey` должен включать tabKey (`automation:${vacancyId}:${tabKey}`), иначе три регистрации перетрут друг друга.
- **Один общий save (saveSettings) сохраняет состояние всех 4 секций сразу.** Если юзер изменил firstMessage в "messages" и dialer в "integrations" — каждый инстанс должен зарегистрировать только свои изменения, но при вызове `saveSettings()` отправит весь `automationData`. Это нормально (сервер мерджит), но нужно следить чтобы при сохранении в табе "integrations" не были стёрты несохранённые изменения из таба "messages".
- **state hoisting** — компонент держит state локально, а `descriptionJson` приходит как prop. После save родитель НЕ ререндерится автоматически с обновлённым descriptionJson, значит baseline в `useVacancySectionRegister` сравнит со старым watchedValues. Нужен `refetchVacancy()` callback после save.

### Предлагаемый план

**Шаг 1.** Добавить пропсу `tabKey: VacancyTabKey` в `AutomationSettingsProps`. Передавать из page.tsx (messages / funnel / integrations).

**Шаг 2.** Добавить `loaded` state: `const [loaded, setLoaded] = useState(false)` + `useEffect(() => { if (descriptionJson !== undefined) setLoaded(true) }, [descriptionJson])`.

**Шаг 3.** Разделить регистрации по логическим группам, не по секциям UI:

```ts
// Группа 1: invite (firstMessage)
useVacancySectionRegister({
  sectionKey: `automation-invite:${vacancyId}:${tabKey}`,
  tabKey,
  loaded: loaded && sections.includes("firstMessage"),
  watchedValues: { firstMessageText, firstMessageDelay },
  save: async () => {
    await saveInviteMessage()
    await saveSettings() // delayMinutes хранится в automationData
  },
})

// Группа 2: reInvite (только если firstMessage)
useVacancySectionRegister({
  sectionKey: `automation-reinvite:${vacancyId}:${tabKey}`,
  tabKey,
  loaded: loaded && sections.includes("firstMessage"),
  watchedValues: { reInviteText },
  save: saveReInviteMessage,
})

// Группа 3: общий automationData (всё кроме invite/reInvite)
useVacancySectionRegister({
  sectionKey: `automation-general:${vacancyId}:${tabKey}`,
  tabKey,
  loaded,
  watchedValues: { responseReaction, autoInvite, autoReject, notifyManager,
    faq, callIntentEnabled, callIntentMode, callIntentKeywords, insistMessages,
    anketaConfEnabled, anketaConfDelay, anketaConfText,
    dialerEnabled, dialerScriptId, dialerTrigger,
    completenessEnabled, completenessThreshold, completenessChannel, completenessDelay },
  save: saveSettings,
})

// Группа 4: pipeline (только если sections.includes("pipeline"))
// Текущая inline PATCH @ ~line 279 — нужно вынести в useCallback и зарегистрировать.
```

**Шаг 4.** Удалить локальные кнопки «Сохранить» внутри каждой секции (там их несколько — поиск `<Button onClick={save... className="gap-1.5"`).

**Шаг 5.** Сценарий тестирования (важно — нет авто-теста, проверять руками):
1. Открыть вакансию → таб «Сообщения» → изменить firstMessage и callIntent.keywords → нажать sticky «Сохранить» → проверить что обе ветки сохранены.
2. Открыть таб «Демо и воронка» → изменить pipeline → переключиться на «Интеграции» БЕЗ сохранения → жёлтая точка должна остаться на табе «Воронка». Изменить dialer в «Интеграциях» → 2 жёлтые точки. Sticky «Сохранить» (2)» → обе сохраняются.
3. Тест refetch'а: сохранить pipeline → убедиться что после refetchVacancy baseline сбросился (жёлтая точка пропала).

### Риски

- **R1 (высокий):** saveSettings посылает весь `automationData` целиком. Если юзер открыл табы «Сообщения» и «Интеграции» в разных окнах браузера и изменил оба, последний save затирает первый. Существующее поведение, не регрессия — но при выкатке sticky-bar (если он шлёт сразу N изменений в произвольном порядке) можно получить race. Митigation: `Promise.all` уже в `saveAll`, но порядок не гарантирован.
- **R2 (средний):** legacy `delayMinutes` хранится в `automationData`, а сама `inviteMessage` — в `aiProcessSettings`. Два разных PATCH. Если первый успешен, а второй упал — состояние UI/БД рассинхрон. Нужен либо одиночный bulk endpoint, либо try/catch с rollback hints.

---

## 2. `saveBranding` в `app/(modules)/hr/vacancies/[id]/page.tsx`

### Текущее состояние

Функция `saveBranding({ logo? })` в page.tsx (поиск по `const saveBranding`, около строки 1056 в текущей версии). Использует state:

```
brandCompanyName, brandColor, brandSlogan, brandLogo,
brandDomainLevel, brandCompanySlug, brandCustomDomain
```

Три call-site'а:
1. После загрузки лого → `setBrandLogo(base64); saveBranding({ logo: base64 })` (auto-save сразу).
2. При удалении лого → `setBrandLogo(""); saveBranding({ logo: "" })` (auto-save).
3. Внизу карточки «Брендинг страницы» — кнопка «Сохранить» вызывает `saveBranding()` без аргументов.

### Сложности

- **Auto-save на загрузку логотипа** — это feature, а не bug. Удалять локальную кнопку нельзя без слома UX (нет визуального подтверждения что лого сохранён, кроме toast).
- Логика sticky-bar предполагает, что секция помечается dirty при изменении watchedValues и сохраняется по нажатию глобальной кнопки. Auto-save при `onChange` ломает baseline-логику — секция dirty → сразу saveBranding → baseline должен сброситься.
- State лежит в монстре-компоненте page.tsx (3500+ строк), вытащить в отдельный hook рискованно.

### Предлагаемый план

**Шаг 1.** Объединить watchedValues в один объект `branding`:
```ts
const branding = useMemo(() => ({
  companyName: brandCompanyName, color: brandColor, slogan: brandSlogan,
  logo: brandLogo, domainLevel: brandDomainLevel, companySlug: brandCompanySlug,
  customDomain: brandCustomDomain,
}), [...])
```

**Шаг 2.** Зарегистрировать `useVacancySectionRegister`:
```ts
useVacancySectionRegister({
  sectionKey: `branding:${id}`,
  tabKey: "page",
  loaded: !!apiVacancy, // загрузка вакансии завершена
  watchedValues: branding,
  save: () => saveBranding(),
})
```

**Шаг 3.** Сохранить auto-save для логотипа (это нормальный UX), но **не вызывать saveBranding извне** в auto-save кейсах — пусть useEffect внутри хука сам пометит dirty + sticky-bar спросит юзера. Альтернатива: оставить auto-save, но после него явно вызвать `markSaved("branding:" + id)` (нужен новый публичный API из контекста).

**Шаг 4.** Удалить нижнюю кнопку «Сохранить» из карточки.

### Риски

- **R1 (средний):** page.tsx — это огромный компонент с десятком useEffect'ов. useVacancySectionRegister должен вызываться внутри `<VacancySettingsProvider>`, но провайдер обёрнут только вокруг табов настроек (`<TabsContent value="settings">`). Текущий saveBranding вызывается из state'а самого page.tsx, ВНЕ провайдера. Нужно либо перенести handler внутрь компонента settings tab, либо использовать `useVacancySettings()` с null-check (если провайдера нет — fallback на старое поведение).

---

## Что сделать в новом ТЗ

1. Прочитать этот файл целиком.
2. Принять решение по R2.1 и R1 (см. риски выше).
3. Реализовать шаги в порядке: AutomationSettings (Шаги 1→5) → branding-save (Шаги 1→4).
4. Не сломать тесты ТЗ-1 Часть 2 (которые подтверждают что sticky-bar появляется и работает в post-demo-settings).
5. Удалить этот файл (`TODO-P0-50-deferred.md`) после завершения.

**Эта задача — последняя из P0-50.** После неё все секции настроек вакансии управляются единой sticky-кнопкой.
