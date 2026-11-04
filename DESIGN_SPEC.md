# DESIGN_SPEC — визуальная система ПАРТА (Сферум / VK UI)

Документ обязателен для людей и ИИ-агентов, которые меняют интерфейс в
`frontend/src`. Его задача — чтобы студент, преподаватель и админ выглядели как
одно приложение в визуальном языке Сферума, а светлая и тёмная темы оставались
согласованными.

## 1. Архитектура темы

Цвета не задаются в компонентах. Работают три слоя:

1. **CSS-переменные** — `frontend/src/index.css`. Значения заданы RGB-триплетами
   для `:root` (светлая тема) и `[data-theme='dark']` (тёмная).
2. **Семантические цвета Tailwind** — `frontend/tailwind.config.js` (`colors`).
   Каждый токен собран как `rgb(var(--c-…) / <alpha-value>)`, поэтому работают
   модификаторы прозрачности: `bg-card/95`, `ring-brand/40`.
3. **Классы в компонентах** — только токены (`bg-card`, `text-ink3`,
   `border-line`, `bg-brandSoft`).

```tsx
// правильно
<div className="rounded-2xl border border-line bg-card text-ink" />
<Badge tone="emerald">Зачтено</Badge>

// запрещено
<div className="bg-slate-900 text-emerald-300" />
<div className="bg-[#2688EB]" />
```

Запрет на палитровые классы (`slate`, `emerald`, `rose`, `sky`, `violet`,
`indigo`, `zinc`, `gray`) и на hex-значения в `src/**/*.tsx` действует для всех
ролей: это ломает тему и создаёт «второй дизайн».

## 2. Темы и переключение

| Правило | Значение |
| --- | --- |
| Тема по умолчанию | **тёмная** |
| Хранение выбора | `localStorage['parta.theme']` = `light` \| `dark` |
| Применение | `document.documentElement.dataset.theme` |
| Переключатель | `src/components/ThemeToggle.tsx`, стоит в `AppShell` и на экране входа |
| API | `useTheme()` из `src/core/theme.tsx`: `{ theme, setTheme, toggle }` |

Любой новый экран обязан выглядеть корректно в обеих темах. Проверять нужно обе:
переключатель стоит в шапке, а параметры темы — в CSS-переменных.

## 3. Токены

### Поверхности и текст

| Токен | Классы | Светлая | Тёмная | Назначение |
| --- | --- | --- | --- | --- |
| `page` | `bg-page` | `#ECEFF3` | `#19191A` | фон приложения |
| `card` | `bg-card` | `#FFFFFF` | `#232324` | панели, карточки, шторки, шапка |
| `muted` | `bg-muted` | `#F4F6F9` | `#2C2D2E` | вложенные блоки, футер шторки |
| `sunken` | `bg-sunken` | `#E9ECF1` | `#3A3A3C` | дорожки, неактивные таблетки |
| `line` | `border-line` | `#DBE0E7` | `#3A3A3C` | основные границы |
| `line2` | `border-line2` | `#CBD2DB` | `#4A4A4C` | границы контролов, hover |
| `ink` | `text-ink` | `#090D13` | `#E1E3E6` | заголовки, основной текст |
| `ink2` | `text-ink2` | `#1A1D21` | `#D2D3D6` | текст в карточках |
| `ink3` | `text-ink3` | `#586371` | `#909499` | подписи, вторичный текст |
| `ink4` | `text-ink4` | `#8A94A1` | `#6B6C70` | placeholder, самый тихий текст |

### Смысловые акценты

| Токен | Пара | Светлая | Тёмная | Когда |
| --- | --- | --- | --- | --- |
| `brand` | `bg-brand`, `text-brand` | `#1F7AE0` | `#4C9AF0` | primary-кнопка, ссылки, активная навигация |
| `brandStrong` | `text-brandStrong` | `#1560B8` | `#6BB0F5` | текст на `brandSoft` |
| `brandSoft` | `bg-brandSoft` | `#E4EFFD` | `#1E334D` | мягкая подложка акцента |
| `brandLine` | `border-brandLine` | `#B2D1F6` | `#345680` | граница акцентных элементов |
| `ok` | `bg-ok`, `text-ok` | `#3D9E3D` | `#4BB34B` | «Зачесть», «в срок», успех |
| `okSoft` / `okLine` | `bg-okSoft` / `border-okLine` | `#E6F5E6` / `#B8DEB8` | `#1E331E` / `#345C34` | подложка успеха |
| `warn` | `bg-warn`, `text-warn` | `#D68400` | `#FFA000` | дедлайн, предупреждение |
| `warnSoft` / `warnLine` | `bg-warnSoft` / `border-warnLine` | `#FFF1D6` / `#ECC578` | `#3D2E10` / `#614A1A` | подложка предупреждения |
| `bad` | `bg-bad`, `text-bad` | `#D43737` | `#FF5C5C` | возврат, ошибка, удаление |
| `badSoft` / `badLine` | `bg-badSoft` / `border-badLine` | `#FDE9E9` / `#F0BEBE` | `#3D1E1E` / `#612F2F` | подложка ошибки |
| `team` | `bg-team`, `text-team` | `#664AF0` | `#9E8CFF` | слоты командных проектов |
| `teamSoft` / `teamLine` | `bg-teamSoft` / `border-teamLine` | `#EDE9FF` / `#CEC4FA` | `#292342` / `#463C70` | подложка команды |

Тени: `--shadow-card` (`shadow-[var(--shadow-card)]`) — карточки и плитки KPI.
В светлой теме тень двухслойная и чуть плотнее, чтобы белые панели отделялись от
серого фона; в тёмной — минимальная.

## 4. Компоненты

### Кнопка — `src/components/Button.tsx`

| `variant` | Вид | Когда |
| --- | --- | --- |
| `primary` | `bg-brand` + белый текст | главное действие экрана, одно на блок |
| `secondary` | `bg-brandSoft` + `brandStrong` | второстепенное действие рядом с primary |
| `ghost` | прозрачная, синий текст | действия в шапках, «Открыть», «Обновить» |
| `outline` | `bg-card` + `border-line2` | нейтральные действия в списках |
| `accept` | `bg-ok` | «Зачесть», подтверждение приёмки |
| `danger` | `bg-bad` | необратимое удаление в модалке |
| `reject` | `bg-badSoft` + `text-bad` | «На доработку» без визуального шума |

Размеры `sm | md | lg`, `loading`, `block`. Иконочные кнопки обязаны иметь
`aria-label`, иконки удаления — нейтральный цвет с красным hover.

### Шторка — `src/components/Modal.tsx`

Белая (тёмная) карточка `bg-card`, `rounded-t-2xl` на мобильном и `rounded-2xl`
на `sm+`, затемнение `bg-black/40`, закрытие по `Escape` и фону, липкий футер
`bg-muted`. Свои оверлеи писать нельзя.

### Кит кабинета — `frontend/src/teacher/components/ui.tsx`

Используется и кабинетом преподавателя, и админкой (`admin/components/ui.tsx`
реэкспортирует его). Состав: `Card`, `Section`, `ScreenHeader`, `StatTile`,
`Progress`, `StackedProgress`, `DeadlineMeter`, `BarChart`, `Chip`, `Segmented`,
`Field`, `TextInput`, `TextArea`, `SelectInput`, `Avatar`, `Badge`, `Kbd`,
`Callout`, `KeyValue`, `Timeline`, `EmptyState`, `ErrorState`, `Skeleton`,
`SkeletonList`, `Toast`, `cn`.

`Badge` тона: `slate` — нейтральный, `indigo`/`sky` — акцент, `emerald` —
успех, `amber` — предупреждение, `rose` — ошибка, `violet` — команда.

## 5. Композиция и адаптивность

- Мобильный каркас: `AppShell` — колонка `max-w-md`, шапка `sticky top-0`,
  контент `px-4 py-4 pb-24`.
- Нижняя навигация: `fixed bottom-0`, горизонтальный скролл
  (`flex overflow-x-auto`), `env(safe-area-inset-bottom)`, активный пункт —
  `bg-brandSoft text-brandStrong`, счётчик — `bg-brand text-white`.
- Горизонтальный скролл страницы запрещён: `scrollWidth === clientWidth` на
  360–1280 px.
- Радиусы: контролы — `rounded-lg` (8 px), карточки — `rounded-2xl` (16 px),
  шторка — `rounded-t-2xl`/`rounded-2xl`.
- Отступы кратны 4: `p-2`, `p-3`, `p-4`, `gap-2`, `space-y-3`.
- Тапы — не меньше 36–40 px по высоте; длинные строки — `truncate`/`line-clamp-2`.

## 6. Доступность

1. Контраст: основной текст — не ниже 4.5:1, вторичный (`ink3`) — не ниже 4.5:1
   на `card`/`page`, иконки и крупный текст — не ниже 3:1.
2. Фокус: `focus-visible:ring-2 focus-visible:ring-brand/40` (или
   `outline-brand`) у всех интерактивных элементов; у полей —
   `focus:border-brand focus:ring-brandLine`.
3. Иконочные кнопки — `aria-label`, поля — `label htmlFor`, ошибки —
   `role="alert"`, активная вкладка — `aria-current="page"`.
4. Цвет не единственный носитель смысла: статус дублируется текстом бейджа.

## 7. Работа с API

1. Единственный вход — `apiFetch` из `src/core/api.ts` (JWT из `localStorage`,
   разбор конверта `{ error, code }`).
2. Никаких моков: `mock/`, `mocks/`, `MOCK_*` запрещены, данные — только с backend.
3. Типы ответов — `src/core/types.ts`; маппинг в UI-модели — в `*/api.ts`.
4. Ошибка всегда `ApiError` (`status`, `code`, `message`): показывать `message`,
   для сетевого сбоя — «Проверьте соединение».
5. Каждый экран обязан иметь состояния `loading`, `error` (с «Повторить») и `empty`.
6. После мутации список перечитывается с сервера, а не правится «на глаз».

## 8. Чек-лист перед коммитом

- [ ] В `src/**/*.tsx` нет палитровых классов и hex-цветов — только токены.
- [ ] Экран проверен в тёмной (по умолчанию) и светлой темах.
- [ ] Действия — `<Button>`, шторки — `<Modal>`, статусы — `<Badge>`.
- [ ] Есть `loading` / `error` / `empty`.
- [ ] Нет горизонтального скролла на 360, 390 и 1280 px.
- [ ] `npx tsc --noEmit`, `npm run build`, `go test ./...` проходят.
