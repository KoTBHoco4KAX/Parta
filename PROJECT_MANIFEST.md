# PROJECT_MANIFEST — ПАРТА (EduRPG для СПО)

> **Назначение документа.** Это точка входа в проект. Прочитав только этот файл и папку
> [`spec/`](spec/), разработчик (человек или ИИ) должен понять, ЧТО уже сделано, ГДЕ это лежит,
> КАК запускается и ЧТО делать следующим шагом. Детали поведения — только в `spec/`.

**Статус:** Фазы 1–5.2 и каркас Фазы 6 завершены; интеграционные тесты (7) — впереди.
**Последнее обновление:** после завершения Фазы 5.2 (WebSocket) и каркаса Фазы 6 (frontend).

---

## Содержание

1. [О проекте](#1-о-проекте)
2. [Текущий статус (roadmap)](#2-текущий-статус-roadmap)
3. [Архитектурные правила и ловушки](#3-архитектурные-правила-и-ловушки)
4. [Как запустить](#4-как-запустить)
5. [Что делать дальше](#5-что-делать-дальше)
6. [Приложения: карта кода, эндпоинты, домен, пробелы](#6-приложения)

---

## 1. О проекте

**ПАРТА** — EduRPG для среднего профессионального образования (колледжи, техникумы, ИСП/СПО,
профильные IT-классы). Мобильный WebApp внутри VK Сферум / MAX.

**Концепция:** канбан-конвейер практических заданий. Студент берёт задачу, двигает карточку
`TODO → IN_PROGRESS → REVIEW → DONE`, преподаватель выносит вердикт «принято/на доработку».
Мотивация — не оценки, а внутренняя валюта **XP**, on-time стрик, пари на собственный результат,
командные проекты с независимыми слотами и анонимное peer-ревью.

### 1.1. Регуляторные ограничения (жёсткие, из `spec/00_ARCHITECTURE.md`)

| Запрещено | Разрешённая замена в системе |
|---|---|
| Оценки 2/3/4/5, замена электронного журнала | Вердикт `ACCEPT`/`REJECT` + XP как внутренняя валюта |
| XP, двигающий официальные дедлайны или покупающий зачёты | XP = только витрина прогресса; дедлайны и приёмка — у преподавателя |
| Платная учебная база, монетизация | Вся учебная база (задания, ГОСТы, методички) открыта по умолчанию |
| Календарные стрики Duolingo-style | Только on-time стрик по фактам сдачи + заморозки за XP |
| Глобальный линейный лидерборд | Групповые комнаты, стрик и личный прогресс; рейтингов «кто выше» нет |
| Открытый файловый P2P-обмен между студентами | Peer-review sandbox: файл не отдаётся, только поток через backend-прокси с одноразовым токеном |

### 1.2. Технологический стек

| Слой | Технология | Примечание |
|---|---|---|
| Бэкенд | Go (в `go.mod` — `go 1.22`, локально собран на 1.25) | только stdlib + SQLite-драйвер |
| БД | SQLite, `modernc.org/sqlite`, режим STRICT, WAL | **без CGO** |
| HTTP | `net/http` + `ServeMux` с method-паттернами (Go 1.22+) | Gin/Echo/Fiber — запрещены |
| JWT | собственная HS256-реализация на `crypto/hmac`+`sha256` | внешних JWT-библиотек нет |
| Реалтайм | WebSocket (`nhooyr.io/websocket` v1.8.17) | комнаты, 8 событий, публикация после Commit |
| Фронт | Vite 5 + React 18 + TypeScript 5 + Tailwind 3 | каркас: api/ws/auth, роутинг, экраны-заготовки |
| Репо | монорепо: `backend/`, `frontend/`, `spec/` | |

---

## 2. Текущий статус (roadmap)

| Фаза | Содержание | Статус | Проверка |
|---|---|---|---|
| **1** | Каркас: `cmd/server`, `internal/config`, embed-миграции, graceful boot | ✅ завершена | `go build ./...` |
| **2** | Миграции: `001_init.sql` (STRICT-схема, индексы, 4 FSM-триггера), `002_seed_dev.sql` | ✅ завершена | применяются при старте |
| **3** | Домен: 8 пакетов (FSM, guards, математика XP, стрик, пари, peer-review, слоты, ошибки) | ✅ завершена | **100% покрытия** (8/8 пакетов) |
| **4** | Storage: 8 репозиториев + `migrate`, `scan`, `keys`, `errors`, `json` | ✅ завершена | **62 теста, 81.4%** |
| **5.1** | HTTP REST API: 11 эндпоинтов, JWT, dev-login, RBAC, маппинг ошибок | ✅ завершена | **79 тестов, 79.8%** (`-coverpkg`) |
| **5.2** | WebSocket: комнаты, конверт событий, публикация из хендлеров | ✅ завершена | `go test ./internal/ws/...` |
| **6** | Frontend: свитчер ролей, роутинг, API/WS-клиент, базовые UI | ✅ каркас | `npm run build` |
| **7** | Интеграционные тесты (REST+WS+БД), read-эндпоинты, polish | ⏳ ожидается | — |

### 2.1. Что именно готово в каждой фазе

**Фаза 2 — миграции** ([`backend/internal/migrations/`](backend/internal/migrations/))

- `001_init.sql` — 10 таблиц (`groups`, `users`, `disciplines`, `teacher_assignments`, `tasks`,
  `team_slots`, `submissions`, `xp_ledger`, `wagers`, `peer_reviews`), все `STRICT`;
  индексы (включая частичные `uq_submissions_individual`, `uq_submissions_team_slot`,
  `uq_wagers_active`, `uq_peer_reviews_active_submission`) и **4 триггера FSM**
  (submissions, team_slots, wagers, peer_reviews) — некорректный переход отбивается на уровне БД.
- `002_seed_dev.sql` — идемпотентный dev-сид: группы `IS-21`/`IS-22`, дисциплины `DB`/`BIZ`,
  пользователи `admin@parta.dev`, `teacher@parta.dev`, `student1..3@parta.dev`,
  назначения преподавателя на обе группы, 2 задачи (`LAB_CODE` base 400 XP,
  `TEAM_PROJECT` base 800 XP, team_size 2) и 2 слота (`DB`, `BIZ`).
  ⚠️ В сиде `base_xp_computed` задан константами; в реальном создании задачи XP всегда
  считается формулой (`domain/xp`).
- `schema_migrations` создаётся кодом (`storage.Migrate`), каждая миграция — в своей транзакции.

**Фаза 3 — домен** ([`backend/internal/domain/`](backend/internal/domain/))

| Пакет | Ответственность |
|---|---|
| `xp` | `ComputeBaseXP`, `ComputeFinalXP`, `ComputeComplexity`, `ComputeDeadlineFactor` (spec/03_MATH.md) |
| `streak` | `Decide` → действие `increment/reset/freeze/noop` и новое состояние стрика |
| `submission` | FSM карточки + `NextStatus` + guards `GuardStart/GuardSubmit/GuardTeacherAccept/GuardTeacherReject/GuardReopen` |
| `teamslot` | FSM слота + `CanCarryOver` (OPEN/ABANDONED/REJECTED + та же группа) |
| `wager` | `ValidateCreate`, `ResolveWin` |
| `peerreview` | `CanClaim`, `CanComplete`, `CanExpire` (лимит 3 активных ревью) |
| `economy` | константы: 200 XP за заморозку, множители 1.5/1.0/0.5, grace 24 ч, веса типов задач |
| `errors` | 8 сентинелов + `IsSentinel` |

**Фаза 4 — storage** ([`backend/internal/storage/`](backend/internal/storage/))

Репозитории: `groups`, `users`, `tasks`, `submissions`, `xp_ledger`, `wagers`, `peer_reviews`,
`team_slots`; инфраструктура: `db.go` (DSN + pragmas + **одно соединение**), `migrate.go`,
`errors.go` (`MapSQLError`), `scan.go` (`querier`/`row`, парсинг времени, `FormatTimestamp`),
`keys.go` (детерминированные ключи идемпотентности), `json.go`.

**Фаза 5.1 — REST API** ([`backend/internal/http/`](backend/internal/http/))

`net/http` только; 11 эндпоинтов; JWT HS256 (24 ч, `iss=parta`); dev-login; RBAC в хендлерах;
единый JSON-формат ошибок; read-only токен peer-review (15 мин, `scope=peer_review:read`);
`withTx`-хелпер; логирование и recovery middleware. Полный список — в [§6.2](#62-rest-api).

**Фаза 5.2 — WebSocket** ([`backend/internal/ws/`](backend/internal/ws/),
[`backend/internal/events/`](backend/internal/events/))

- `events` — конверт `{event_id,event_type,timestamp,actor_id,room,payload}`, UUID v4 без
  внешних зависимостей, имена комнат `user/group/teacher/task`, интерфейс `Publisher`
  и `NoopPublisher` (REST-тесты идут без хаба).
- `auth` — `TokenService`/`Claims` вынесены из `internal/http`, чтобы `http` и `ws` не
  образовывали цикл; в `http` остались псевдонимы (`NewTokenService`, `Claims`, `TokenService`).
- `ws.Hub` — мьютекс + `map[room]map[*conn]struct{}`, неблокирующая публикация (медленный
  клиент закрывается), `Connections()`, `Close()` для graceful shutdown.
- `ws.Server` — `GET /ws?token=<jwt>`; без/битый токен → 401 JSON; базовые комнаты
  `user:{id}`, `group:{id}` (студент), `teacher:{id}` (преподаватель/админ); команды
  `{"action":"subscribe|unsubscribe","rooms":[...]}` с проверкой прав (чужие `user/teacher/group`,
  `task` другой группы отклоняются); ping 30 c, write-deadline 10 c, read-limit 32 KiB.
- Публикация — строго после `tx.Commit()` в хендлерах. Отправляются все 8 событий:
  `submission.card.moved` (в `group` + `task`), `review.inbox.created` (в `teacher`),
  `submission.verdict.issued`, `xp.ledger.posted`, `streak.updated`, `wager.resolved`,
  `peer_review.state_changed`, `team_slot.state_changed`.

**Фаза 6 — фронтенд** ([`frontend/src/`](frontend/src/))

- `core/api.ts` — fetch-обёртка с Bearer, разбор `{error,code}`, типизированные вызовы
  всех 11 мутаций; `core/types.ts` — DTO.
- `core/ws.ts` — один сокет на сессию, экспоненциальный backoff с джиттером, повторная
  подписка после реконнекта, дедупликация по `event_id`, статус online/offline.
- `core/auth.ts` — dev-свитчер ролей (`admin/teacher/student@parta.dev`), токен в
  `localStorage`, обновление XP/стрика по WS-событиям.
- `App.tsx` — hash-роутинг (`/`, `/board`, `/inbox`, `/economy`), мобильный layout,
  нижняя навигация; экраны `Login/Dashboard/Board/Inbox/Economy` — каркас под read-API.
- `components/Button.tsx`, `components/Modal.tsx` — базовые UI-компоненты.
- `vite.config.ts` — proxy `/api` и `/ws` на `localhost:8080` (ws: true).

---

## 3. Архитектурные правила и ловушки

### 3.1. `spec/` — единственный источник истины

| Файл | Что задаёт | Когда сверяться |
|---|---|---|
| [`spec/00_ARCHITECTURE.md`](spec/00_ARCHITECTURE.md) | регуляторика, стек, командные слоты, carry-over, конверт и события WS | любое решение «а можно ли так» |
| [`spec/01_SCHEMA.sql`](spec/01_SCHEMA.sql) | DDL, CHECK-и, индексы, триггеры FSM | изменение схемы, новые поля |
| [`spec/02_FSM.md`](spec/02_FSM.md) | таблицы переходов, guard-и, grace-период, sandbox-ограничения | любой переход статуса |
| [`spec/03_MATH.md`](spec/03_MATH.md) | BaseXP, SlotBaseXP, speedrun-множитель, on-time стрик | начисление XP/стрика |
| [`spec/04_API.md`](spec/04_API.md) | контракты REST (пути, тела, коды ответов) | новый/изменённый эндпоинт |

Правила:

1. **Не менять `spec/` молча.** Если реализация расходится со спекой — это дефект реализации;
   если расходится сама спека — правка спеки оформляется отдельным решением и фиксируется здесь.
2. **Ручной ввод XP запрещён.** Преподаватель меняет только `R`, `H`, `task_type`, `deadline_at`,
   `speedrun_window_hours`, `team_size`; `base_xp_computed` считает сервер.
3. **FSM дублируется намеренно:** домен (`domain/*`) + триггеры SQLite. Не «оптимизируйте»,
   убирая один из слоёв.
4. **Новые внешние зависимости — только с согласования.** В `go.mod` две прямые
   зависимости: `modernc.org/sqlite` и `nhooyr.io/websocket` (реалтайм, согласована манифестом).

### 3.2. ЛОВУШКА SQLITE: одно соединение и дедлок в транзакции ⚠️

`storage.Open` делает `db.SetMaxOpenConns(1)` — SQLite в WAL не терпит конкурентных писателей,
поэтому все транзакции сериализуются самим `database/sql`.

**Следствие:** `BeginTx` забирает единственное соединение. Любой вызов репозитория, который
ходит в `*sql.DB` (а не в `tx`), внутри открытой транзакции **зависнет навсегда** — без ошибки,
без таймаута, тест просто упадёт по общему таймауту.

**Правило:**

```
1) Прочитать всё нужное ДО BeginTx (через *sql.DB).
2) Внутри withTx — только tx-методы.
3) Никаких "а давай ещё раз прочитаем пользователя" внутри транзакции.
```

Tx-осведомлённые методы (единственные, что безопасны внутри `withTx`):

| Репозиторий | Методы с `*sql.Tx` |
|---|---|
| `TaskRepo` | `CreateTx`, `getByID(tx)` (внутренний), `UpdateBaseXP` |
| `SubmissionRepo` | `UpdateStatus`, `RecordRevision` |
| `XPLedgerRepo` | `Post`, `GetByIdempotencyKey`, `ListByUser` |
| `WagerRepo` | `Create`, `Resolve` |
| `PeerReviewRepo` | `Create`, `Claim`, `Complete`, `Expire` |
| `TeamSlotRepo` | `Claim`, `CarryOver`, `MarkSubmitted`, `CreateSlots` |
| `UserRepo` | `UpdateXPBalance`, `UpdateStreakTx`, `DecrementFreezesTx`, `AddFreezes` |

Чтение «через БД» внутри транзакции, например `users.GetByID(...)`, `tasks.GetByID(...)`,
`CountActiveByReviewer(...)`, `ListActiveByTask(...)` — **нельзя**. Именно поэтому в
`handleVerdict` пользователь и активные пари читаются до `withTx`, а в `handleClaimPeerReview`
счётчик активных ревью — до транзакции. Смотрите [`http/router.go`](backend/internal/http/router.go)
(`withTx`) как эталон.

### 3.3. Ошибки → HTTP

Домен возвращает сентинелы из `domain/errors`; транспорт переводит их в коды
([`http/respond.go`](backend/internal/http/respond.go), функция `mapError`):

| Сентинел | HTTP | `code` в JSON |
|---|---|---|
| `ErrInvalidTransition` | 409 | `invalid_transition` |
| `ErrAlreadyExists` | 409 | `already_exists` |
| `ErrForbidden` | 403 | `forbidden` |
| `ErrNotFound` | 404 | `not_found` |
| `ErrGuardFailed` | 422 | `guard_failed` |
| `ErrDeadlinePassed` | 422 | `deadline_passed` |
| `ErrInsufficientXP` | 422 | `insufficient_xp` |
| `ErrInvalidArgument` | 422 | `invalid_argument` |
| прочее / паника | 500 | `internal` (текст наружу не отдаётся) |

Формат тела ошибки — всегда `{"error": "<text>", "code": "<sentinel>"}`.

Особые случаи:

- битый JSON → **400** `{"code":"invalid_json"}` (по `spec/04_API.md`);
- нет/битый/просроченный JWT → **401** `{"code":"unauthorized"}`;
- неизвестный `/api/*` → JSON-404 (`handleNotFound`), а не текстовый ответ `ServeMux`.

**Никогда не пишите HTTP-коды вручную в хендлерах** — возвращайте доменную ошибку в `writeError`.

### 3.4. Транзакции и идемпотентность

- Любая операция, меняющая баланс XP, обязана идти в транзакции вместе с изменением статуса.
- `xp_ledger.idempotency_key` — `UNIQUE`; повторный `Post` с тем же ключом возвращает
  существующую проводку (не списывает дважды). Ключи: `submission:{id}:accept:{reason}`,
  `wager:{id}:place`, `wager:{id}:settle:{result}`, `peer_review:{id}:escrow|reward|refund`,
  `freeze:{userID}:{unixnano}`.
- Гонки закрываются частичными `UNIQUE`-индексами: повторная карточка, второе активное пари,
  второе активное ревью → 409 `already_exists`.
- Порядок в `ACCEPT`: `UpdateStatus(DONE)` → `ledger.Post` → стрик → закрытие пари → `Commit`.
  Публикация WS-событий — **после** успешного `Commit` (см. §5).

### 3.5. Время

- В БД — TEXT в UTC-формате `2006-01-02T15:04:05.000Z`
  (пишется `strftime('%Y-%m-%dT%H:%M:%fZ','now')`; из Go — `storage.FormatTimestamp`).
- В JSON — RFC3339 (`time.RFC3339`); в ответах — `time.RFC3339Nano` (`formatTimePtr`).
- On-time всегда считается по `submitted_at`, **не** по `reviewed_at` (инвариант
  «студент не наказывается за задержку преподавателя»).

### 3.6. Прочее, что легко сломать

- Порядок middleware: `recoverer → logging → mux → authenticate(/api/)`; dev-login — публичный
  и регистрируется более специфичным паттерном.
- RBAC — в хендлере через `requireRole(w, p, ...)`; в БД роли дополнительно ограничены CHECK.
- `PARTA_ENV != "dev"` → dev-login отвечает 403; других способов логина пока нет.
- `students` обязаны иметь `group_id`, `teacher`/`admin` — не иметь (CHECK в схеме).
- Секреты и пути — только через `config.Load()`, не через `os.Getenv` в хендлерах.

---

## 4. Как запустить

### 4.1. Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PARTA_ENV` | `dev` | `dev` включает dev-login и сид-аккаунты; любое другое значение выключает dev-login |
| `PARTA_JWT_SECRET` | `dev-secret-change-me` | секрет HS256; **на проде обязателен свой** |
| `PARTA_DB_PATH` | `./parta.db` | путь к файлу SQLite (WAL: рядом появятся `-shm`/`-wal`) |
| `PARTA_ADDR` | `:8080` | адрес HTTP-сервера |

### 4.2. Запуск бэкенда

```bash
cd backend

# вариант 1 — напрямую
PARTA_ENV=dev PARTA_JWT_SECRET=dev-secret PARTA_DB_PATH=./parta.db PARTA_ADDR=:8080 \
  go run ./cmd/server

# вариант 2 — через Makefile
make run          # go run ./cmd/server
make build        # go build -o bin/server ./cmd/server
make test         # go test ./...
make clean-db     # rm -f parta.db parta.db-shm parta.db-wal
```

> Windows/PowerShell: `$env:PARTA_ENV="dev"; $env:PARTA_ADDR=":8080"; go run ./cmd/server`.
> Порт занят — `netstat -ano | findstr :8080` и смените `PARTA_ADDR`.

При старте сервер сам применяет все миграции, включая `002_seed_dev.sql` (миграции применяются
**всегда**, не только в dev; сид идемпотентен и безопасен для повторного запуска).
В логе будет `migrations applied` и `http: listening on :8080 (env=dev)`.

> ⚠️ Для реального продакшена dev-сид в общем списке миграций — долг: тестовые аккаунты
> `admin@parta.dev` и т.п. попадут в рабочую БД. Перед выкладкой вынесите `002_seed_dev.sql`
> из embed-набора (или разведите миграции на dev/prod-потоки) — это задача Фазы 7.

### 4.3. Получение JWT (dev)

```bash
curl -s -X POST http://localhost:8080/api/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher@parta.dev"}'
# -> {"token":"eyJ...","user":{"id":2,"role":"teacher",...}}
```

Готовые аккаунты сида (пароля нет, вход только по email и только в dev):

| Email | Роль | Группа |
|---|---|---|
| `admin@parta.dev` | admin | — |
| `teacher@parta.dev` | teacher | — |
| `student1@parta.dev` | student | IS-21 |
| `student2@parta.dev` | student | IS-21 |
| `student3@parta.dev` | student | IS-22 |

Дальше любой защищённый вызов: `-H "Authorization: Bearer $TOKEN"`.

### 4.4. Проверки качества (что должно быть зелёным)

```bash
cd backend
go build ./...                              # exit 0
go vet ./...                                # exit 0
go test ./...                               # все пакеты ok

# по слоям, с покрытием
go test ./internal/domain/...  -cover        # 100% в каждом из 8 пакетов
go test ./internal/storage/... -cover        # 62 теста, ~81%
go test ./internal/http/... -v -cover \
  -coverpkg=github.com/parta/backend/internal/http   # REST-тесты, ~80%
go test ./internal/ws/... ./internal/events/...     # WS-комнаты, права, доставка
```

⚠️ `-coverpkg` обязателен для `internal/http`: тесты лежат в отдельном пакете
`internal/http/tests`, и без него `go test` инструментирует только сам тестовый пакет
(получите `coverage: [no statements]` или `0.0%`).

### 4.5. Фронтенд (каркас)

```bash
cd frontend
pnpm install     # или npm install; node_modules в .gitignore
npm run dev      # http://localhost:5173, /api и /ws проксируются на :8080
npm run build    # tsc && vite build
```

Сейчас это рабочий каркас: свитчер ролей, профиль с XP/стриком, живая WS-лента,
канбан-колонки, форма вердикта и покупка заморозок. Списки заданий/карточек/инбокса
появятся после read-эндпоинтов Фазы 7 — до этого экраны показывают пустые состояния.
Прокси `/api` и `/ws` уже настроен в `vite.config.ts`.

### 4.6. Особенности текущего окружения

- Репозиторий инициализирован; рабочая ветка Core — `feat/core-ws`. Игнор-лист живёт
  в корневом [`.gitignore`](.gitignore) и [`backend/.gitignore`](backend/.gitignore): `bin/`, `*.db*`, `.env`,
  локальные Go-кэши (`.gocache/`, `.gomodcache/`, `.gopath/`, `.gotmp/`), `cover.out`, логи тестов.
- Если сборка падает с `Access is denied` на `%USERPROFILE%\go-build` или `…\go\pkg\mod`
  (типично для песочницы/ограниченного профиля), задайте кэши внутри репозитория:
  `$env:GOCACHE="$PWD\.gocache"; $env:GOMODCACHE="$PWD\.gomodcache"; $env:GOPATH="$PWD\.gopath"`.
- Некоторые обёртки команд срезают суффикс `.out` у аргументов — если `-coverprofile=cover.out`
  создаёт файл `cover`, генерируйте имя через переменную или проверяйте фактическое имя файла.

---

## 5. Что делать дальше

> **Статус:** шаги 1 (WebSocket) и 2 (каркас фронтенда) выполнены в ветке `feat/core-ws`.
> Ниже сохранены их контракты как справка. Актуальный следующий шаг — шаг 3 (Фаза 7):
> read-эндпоинты, сквозные тесты REST+WS+БД, expire-джоба, polish.

### Шаг 1 (Фаза 5.2). WebSocket-слой — ✅ выполнено

**Зависимость:** `go get nhooyr.io/websocket` (сейчас в `go.mod` её нет; это единственная
планируемая новая зависимость, согласована манифестом).

**Спецификация — `spec/00_ARCHITECTURE.md`, раздел V:** подключение
`wss://.../ws?token=<jwt>`, комнаты `user:{id}`, `group:{id}`, `teacher:{id}`, `task:{id}`,
доставка **at-least-once**, клиент дедуплицирует по `event_id`.

Конверт события (не менять форму):

```json
{
  "event_id": "uuid",
  "event_type": "submission.card.moved",
  "timestamp": "2026-10-10T12:00:00.000Z",
  "actor_id": 42,
  "room": "group:10",
  "payload": {}
}
```

События и их payload:

| `event_type` | payload | Когда публиковать |
|---|---|---|
| `submission.card.moved` | `submission_id, task_id, student_id, from, to, submitted_at` | после PATCH статуса |
| `review.inbox.created` | `submission_id, task_id, student_id, group_id, submitted_at, waiting_seconds` | при переходе в `REVIEW` (комната `teacher:{id}`) |
| `submission.verdict.issued` | `submission_id, verdict, xp_awarded, streak_delta, reviewed_at` | после ACCEPT/REJECT |
| `xp.ledger.posted` | `ledger_id, user_id, amount, balance_after, reason` | после любой проводки |
| `streak.updated` | `user_id, on_time_streak, streak_freezes, reason` | после изменения стрика |
| `wager.resolved` | `wager_id, status, stake_amount, payout` | после `WagerRepo.Resolve` |
| `peer_review.state_changed` | `peer_review_id, status, reviewer_id, expires_at` | create/claim/complete/expire |
| `team_slot.state_changed` | `team_slot_id, task_id, status, assigned_user_id` | claim/carry-over/submit |

Рекомендуемая архитектура (не противоречит текущему коду):

1. Новый пакет `backend/internal/ws`: `Hub` (мьютекс + `map[room]map[*conn]struct{}`),
   `ServeWS`, обработка конверта и подписок.
2. Чтобы не получить цикл импортов, вынесите контракт в отдельный пакет:
   `backend/internal/events` — тип `Event`, конструктор конверта (`event_id`, `timestamp`) и
   интерфейс `Publisher{Publish(...)}`. `httpapi` зависит от `events` (и от `ws` только как
   от реализации — лучше вообще через интерфейс), `ws` тоже зависит от `events`.
   В `httpapi.New` Publisher по умолчанию — no-op, чтобы REST-тесты не требовали WS.
3. Публикация событий — **строго после `tx.Commit()`**: сначала фиксируем факт, потом уведомляем.
   При ошибке публикации запрос не откатывать (WS — уведомление, не источник истины).
4. `event_id` — UUID; `timestamp` — RFC3339 с миллисекундами (формат events в spec).
5. Аутентификация: **не пишите второй JWT-парсер**. `TokenService`/`Claims` сейчас живут в
   `internal/http`, и если `ws` начнёт импортировать `http`, а `http` — `ws`, будет цикл.
   Чистый вариант: перенести `TokenService` и `Claims` в `backend/internal/auth` (пакет без
   зависимостей от HTTP/WS) и использовать и в `httpapi`, и в `ws`. Токен передаётся в query
   (`?token=`), т.к. браузерный `WebSocket` не умеет заголовки.
6. Комнаты: `user:{id}` — сам пользователь; `group:{id}` — все студенты его группы;
   `teacher:{id}` — преподаватель (для инбокса); `task:{id}` — подписчики задания.
7. Подписки на комнаты — по правам из JWT: студент не должен получать `teacher:*` и чужие `user:*`.
8. Обязательно: `Ping`/`ReadLimit`/write-deadline, `defer conn.Close`, очистка хаба при отключении,
   graceful shutdown вместе с `http.Server`, лог количества активных соединений.

**Тесты (Фаза 7 или сразу):** `httptest.NewServer` + `nhooyr` dial; проверить: отказ без токена,
доставку `submission.card.moved` в `group:*`, адресность `review.inbox.created` только преподавателю,
дедупликацию на клиенте (по `event_id` — это ответственность клиента, в тесте можно проверить
наличие уникальных id).

**Чего делать нельзя:** отправлять события до коммита, делать WS источником истины,
дублировать бизнес-логику вердикта в WS-хендлере, добавлять второй JWT-парсер.

### Шаг 2 (Фаза 6). Frontend — ✅ каркас готов

Каркас уже есть: `frontend/` (Vite + React 18 + TS + Tailwind, заглушка `App.tsx`).
Порядок работ:

1. **Инфраструктура:** proxy `/api` и `/ws` в `vite.config.ts`; `src/api/client.ts`
   (fetch + Bearer + разбор `{error, code}`, общий тип `ApiError`); `src/api/types.ts`
   (DTO, зеркальные `spec/04_API.md`); состояние авторизации (Context или Zustand —
   новых тяжёлых зависимостей не добавлять без согласования).
2. **Свитчер ролей (dev):** три кнопки Admin/Teacher/Student → `POST /api/auth/dev-login`
   по email из таблицы §4.3, токен в памяти (+ `localStorage` для перезагрузки),
   показ текущего пользователя, XP и стрика.
3. **Канбан студента:** колонки `TODO / IN_PROGRESS / REVIEW / DONE / REJECTED`,
   карточки из заданий группы; действия: `START`, `SUBMIT` (url + sha256),
   `REOPEN`; блокировка артефакта в `REVIEW` и в `DONE`.
4. **Инбокс преподавателя:** работы в `REVIEW` + `waiting_seconds`; кнопки
   `ACCEPT` / `REJECT` (комментарий обязателен); после вердикта — карточка уходит из инбокса,
   приходят `xp_awarded` и `streak_after`.
5. **Экономика:** покупка заморозок (200 XP/шт), пари, peer-review (создать / взять / завершить
   по чек-листу), командные слоты (claim / carry-over).
6. **WS-клиент:** один сокет на сессию, переподключение с backoff, дедупликация по `event_id`,
   инвалидация/патч локального состояния по `event_type`; индикатор «онлайн/оффлайн».
7. **UI-режим:** вертикальный мобильный вьюпорт, Tailwind, никаких горизонтальных лидербордов;
   аккуратно с регуляторикой из §1.1 (не рисовать «оценки», не показывать глобальные рейтинги).

### Шаг 3 (Фаза 7). Интеграция и polish

- Сквозные тесты: REST + WS + БД (создание задачи → карточка → REVIEW → WS-события → ACCEPT → XP/стрик/пари).
- Публикация всех 8 событий из §5.1 и проверка адресности по комнатам.
- Расширение REST для чтения (см. [§6.5](#65-известные-пробелы-важно-для-следующего-шага)) — без него фронтенд не наполнит канбан и инбокс.
- Наблюдаемость: структурные логи, метрики WS-соединений, health-эндпоинт.
- Нефункциональное: `busy_timeout`, лимиты тела (уже 1 MiB в `decodeJSON`), rate-limit на dev-login.

---

## 6. Приложения

### 6.1. Карта кода

```
Parta/
├── PROJECT_MANIFEST.md          ← этот файл
├── spec/                        ← источник истины (5 файлов)
├── backend/
│   ├── go.mod                   (go 1.22; modernc.org/sqlite, nhooyr.io/websocket)
│   ├── Makefile                 (build/run/test/migrate/clean-db)
│   ├── cmd/server/main.go       (config → Open → Migrate → REST + WS + graceful shutdown)
│   └── internal/
│       ├── config/              (PARTA_* + JWTIssuer/JWTTTL)
│       ├── auth/                (TokenService/Claims HS256 — общий для http и ws)
│       ├── events/              (конверт, UUID, комнаты, Publisher)
│       ├── migrations/          (embed + 001_init.sql, 002_seed_dev.sql)
│       ├── domain/              (economy, errors, peerreview, streak, submission, teamslot, wager, xp)
│       ├── storage/             (db, migrate, errors, scan, keys, json + 8 репозиториев + тесты)
│       ├── ws/                  (Hub, Server, client + ws_test.go)
│       └── http/                (router, middleware, respond, auth, events + handlers + tests/)
└── frontend/
    ├── vite.config.ts           (proxy /api и /ws)
    └── src/
        ├── App.tsx              (hash-роутинг, мобильный shell)
        ├── core/                (api.ts, ws.ts, auth.ts, types.ts)
        ├── components/          (Button.tsx, Modal.tsx)
        └── pages/               (Login, Dashboard, Board, Inbox, Economy)
```

### 6.2. REST API

Все пути под `/api`, аутентификация `Authorization: Bearer <jwt>`, ответы JSON.
Исходные контракты — `spec/04_API.md`; ниже фактическое состояние реализации.

| # | Метод и путь | Роли | Успех | Основные ошибки | Файл |
|---|---|---|---|---|---|
| 1 | `POST /api/auth/dev-login` | — (только `PARTA_ENV=dev`) | 200 `{token,user}` | 403, 404, 400 | `auth.go` |
| 2 | `POST /api/tasks` | teacher, admin | 201 `{task_id,base_xp_computed,status,slots_count}` | 403, 404, 422 | `tasks.go` |
| 3 | `POST /api/submissions` | student | 201 (200 при повторе) | 403, 404, 422 | `submissions.go` |
| 4 | `PATCH /api/submissions/{id}/status` | student | 200 `{submission_id,status,submitted_at}` | 403, 404, 409, 422 | `submissions.go` |
| 5 | `POST /api/submissions/{id}/verdict` | teacher, admin | 200 `{submission_id,status,xp_awarded,streak_after,ledger_id}` | 403, 404, 409, 422 | `submissions.go` |
| 6 | `POST /api/users/me/streak-freezes/purchase` | student | 200 `{streak_freezes,xp_balance,ledger_id}` | 403, 422 | `economy.go` |
| 7 | `POST /api/wagers` | student | 201 `{wager_id,status,escrow_tx_id,stake_amount}` | 403, 404, 409, 422 | `wagers.go` |
| 8 | `POST /api/peer-reviews` | student | 201 `{peer_review_id,status,escrow_tx_id}` | 403, 404, 409, 422 | `peer_reviews.go` |
| 9 | `POST /api/peer-reviews/{id}/claim` | student | 200 `{peer_review_id,status,reviewer_id,access_token}` | 403, 404, 409, 422 | `peer_reviews.go` |
| 10 | `POST /api/peer-reviews/{id}/complete` | student (reviewer) | 200 `{peer_review_id,status,reward_xp,ledger_id}` | 403, 404, 409, 422 | `peer_reviews.go` |
| 11 | `POST /api/team-slots/{id}/carry-over` | student (своя группа) | 200 `{team_slot_id,assigned_user_id,status,bonus_xp}` | 403, 404, 409, 422 | `team_slots.go` |

Детали, которых нет в `spec/04_API.md` (реализованы как расширение):

- `POST /api/tasks` дополнительно возвращает `slots_count` и создаёт `team_size` слотов
  (`DB`, `BIZ`, `QA_DOC`, `DEVOPS`, при `team_size > 4` — с суффиксом `_2`, `_3`).
- `POST /api/peer-reviews/{id}/claim` выдаёт `access_token` — read-only JWT на 15 минут
  (`scope=peer_review:read`, `peer_review_id`), по `spec/02_FSM.md`.
- `POST /api/team-slots/{id}/carry-over` возвращает `bonus_xp` = `tasks.base_xp_computed`
  (для `TEAM_PROJECT` это уже SlotBaseXP). Начисление бонуса происходит не здесь, а при приёмке слота.

События канбана (`PATCH .../status`): `START` (TODO→IN_PROGRESS), `SUBMIT` (IN_PROGRESS→REVIEW,
нужны `artifact_url` + `artifact_hash`), `REOPEN` (REJECTED→IN_PROGRESS).
Вердикты: `ACCEPT` (REVIEW→DONE) и `REJECT` (REVIEW→REJECTED, `comment` обязателен).

### 6.2.1. WebSocket

`GET /ws?token=<jwt>` (в браузере заголовки недоступны, поэтому токен в query).
Ответы рукопожатия в общем формате ошибок: нет/битый/просроченный токен → **401**
`{"error":"…","code":"unauthorized"}`.

После подключения сервер присылает служебный кадр
`{"type":"ready","rooms":["user:5","group:1"]}` и сразу подписывает на базовые комнаты:
`user:{id}`; студенту — `group:{id}`; преподавателю/админу — `teacher:{id}`.
Дополнительные подписки:

```json
{"action":"subscribe","rooms":["task:12"]}
{"action":"unsubscribe","rooms":["task:12"]}
```

На каждую команду приходит `{"type":"ack","rooms":[...]}`; запрещённая комната даёт
`{"type":"error","error":"forbidden room: …"}` и не подписывает. Права: только своя
`user:*` и `teacher:*`; `group:*` — своя группа; `task:*` — задание своей группы
(студент) или своё назначение (преподаватель); `admin` — любые комнаты.

События — конверт из `spec/00_ARCHITECTURE.md` §V, поля не менялись. `submission.card.moved`,
`submission.verdict.issued` и `team_slot.state_changed` уходят в комнату группы **и** в
`task:{id}` с одинаковым `event_id`; `review.inbox.created` — в `teacher:{id}`;
XP/стрик/пари — в `user:{id}`. Доставка at-least-once, дедупликация — на клиенте
(`frontend/src/core/ws.ts`).

### 6.3. Домен: шпаргалка по вызовам

```go
xp.ComputeBaseXP(xp.BaseXPInput{TaskType, RequirementsCount, ExpectedHours, CreatedAt, DeadlineAt, TeamSize}) int
xp.ComputeFinalXP(baseXP int, submittedAt, deadlineAt time.Time, speedrunWindow time.Duration) int
streak.Decide(streak.UserStreak{OnTimeStreak, Freezes}, deadline, now time.Time, hasSub bool, doneAt *time.Time) streak.StreakDecision
submission.NextStatus(from Status, e Event) (Status, error)
submission.GuardStart / GuardSubmit / GuardTeacherAccept / GuardTeacherReject / GuardReopen
teamslot.CanCarryOver(status, requesterGroupID, taskGroupID int64) error
wager.ValidateCreate(stake, balance int, wagerDeadline, taskDeadline, now time.Time) error
peerreview.CanClaim(authorID, reviewerID int64, st Status, now, expiresAt time.Time, activeReviews int) error
peerreview.CanComplete(reviewerID int64, st Status, checklistFilled bool) error
economy.StreakFreezePriceXP (=200), SpeedrunMultiplier (1.5), NormalMultiplier (1.0), LateMultiplier (0.5)
```

Инварианты, которые нельзя нарушать:

- BaseXP = `max(10, round(50 * C * F_d))`, для `TEAM_PROJECT` — `max(10, round(BaseXP / team_size * 1.15))`.
- Speedrun: `submitted_at <= deadline - speedrun_window` → ×1.5; `<= deadline` → ×1.0; иначе ×0.5.
- Стрик инкрементируется только за `final_submitted_at <= deadline`; сброс — только при
  непустом множестве просроченных задач; заморозка тратится вместо сброса; пустой `Due` не сбрасывает.
- Пари: победа ⇔ есть `DONE` с `final_submitted_at <= wager.deadline_at`; выплата `2 × stake`;
  `LOST` — без возврата; `CANCELLED` — возврат ставки.
- Peer-review: рецензент ≠ автор, не более 3 активных ревью, `reward_amount <= escrow_amount`.

### 6.4. Данные dev-сида (для ручных проверок)

- Группы: `IS-21`, `IS-22`; дисциплины: `DB` (Базы данных), `BIZ` (Бизнес-логика и API).
- Задача `LAB_CODE` «Лабораторная №1: нормализация схемы», дедлайн `2027-12-31T18:00:00.000Z`,
  speedrun 48 ч, `base_xp_computed = 400`, группа IS-21.
- Задача `TEAM_PROJECT` «Командный проект: сервис учёта заявок», `base_xp_computed = 800`,
  `team_size = 2`, слоты `DB` и `BIZ` в статусе `OPEN`.
- Баланс всех пользователей на старте — 0 XP; чтобы проверить покупку заморозки/пари,
  начислите XP через `xp_ledger` (только dev) либо Accept-ните работу.

### 6.5. Известные пробелы (важно для следующего шага)

1. **Нет read-эндпоинтов.** `spec/04_API.md` описывает только мутации. В storage уже готовы
   `TaskRepo.ListByGroup`, `SubmissionRepo.ListByStudent`, `ListReviewInbox`,
   `XPLedgerRepo.ListByUser`, `WagerRepo.ListActiveByTask`, `TeamSlotRepo.ListByTask` —
   но HTTP-маршрутов для них нет. Фронтенду понадобятся как минимум:
   `GET /api/tasks`, `GET /api/submissions/me`, `GET /api/reviews/inbox`,
   `GET /api/team-slots?task_id=`, `GET /api/users/me`.
2. **Приёмка командного слота не реализована в HTTP.** В домене слоты живут, в storage есть
   `MarkSubmitted`; эндпоинтов `submit`/`accept` для слота нет, начисление `SlotBaseXP` и
   `CARRY_OVER_BONUS` (100% SlotBaseXP, `spec/00_ARCHITECTURE.md` §IV.3) пока не проводятся.
   При carry-over сбрасывание стрика прежнего владельца тоже ещё не реализовано (сейчас
   стрик пересматривается только при вердикте).
3. **Нет операций жизненного цикла задач** (`ARCHIVED`, редактирование, пересчёт BaseXP при
   смене R/H/deadline) и **нет expire-джобы** для peer-review (`PeerReviewRepo.Expire` есть,
   планировщика нет). `WagerRepo.Resolve(CANCELLED)` тоже не выведен в API.
4. **Grace-период 24 ч** (`spec/02_FSM.md`, п. 4) не хранится отдельным полем: инвариант
   «XP и стрик считаются по `submitted_at`» реализован напрямую в `acceptSubmission`,
   поэтому отдельный `grace_until` не понадобился. При доработке reject-flow это надо помнить.
5. **Возврат escrow peer-review** проводится как `ADMIN_ADJUSTMENT`, потому что в CHECK
   `xp_ledger.reason` нет отдельной причины возврата (ближайшая — `ADMIN_ADJUSTMENT`).
   Если спек расширят причиной `PEER_REVIEW_REFUND`, миграция `003_*` + правка `Expire`.
6. **Реалтайм-доставка не персистентна.** Хаб живёт в памяти: при реконнекте клиент не
   получает пропущенные события (at-least-once действует только на активное соединение).
   Для «догона» нужен журнал событий/outbox — задача Фазы 7.
7. **Фронтенд — каркас, а не полный UI.** Нет списков из REST, drag&drop, формы создания
   задания, экранов peer-review/слотов; после read-эндпоинтов их нужно наполнить.
   `npm run build` зелёный, dev-сервер проксирует `/api` и `/ws`.

---

**Правило для следующего агента:** перед изменением поведения — открой соответствующий файл
`spec/`, найди нужный раздел, и только потом пиши код. После работы обязательны
`go build ./...`, `go vet ./...`, `go test ./...` и обновление этого манифеста
(раздел 2 «статус», раздел 5 «что дальше», раздел 6.5 «пробелы»).
