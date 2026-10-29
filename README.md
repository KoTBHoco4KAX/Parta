Готово, фронтенд-часть завершена и всё запушено.

Frontend
AttachmentList.tsx: ATTACHMENTS_ENABLED = true, список берётся из GET /api/attachments, скачивание — fetch с JWT и переходом по 302. Если внешний artifact_url закрыт CORS, файл открывается в новой вкладке. На успех — toast «Файл скачан».
api.ts: типы вложений переведены на строковый id (artifact-{submission_id}) + url; deprecated-обёртка awardReviewerXP удалена, компоненты используют только awardPeerReview и UI-поля amount / totalXp / ledgerId.
ReviewInbox.tsx и VerdictModal.tsx: прокинут notify до вложений.
Обновлены index.ts и README.
Backend
teacher_api.go: award, PATCH группы, фильтр users, attachments list/download (302 без проксирования).
router.go: 5 маршрутов.
004_users_group_optional.sql + migrate.go: снят запрет «студент без группы» — иначе PATCH group_id=null упирался в CHECK из spec/01_SCHEMA.sql. Спека тоже обновлена.
teacher_api_test.go: 14 кейсов на award/PATCH/GET users/attachments, включая 401/403/404/409/422, повтор award без двойного начисления и 302.
Проверки
go build ./..., go vet ./... — чисто.
go test -count=1 ./... — все пакеты ok.
npm run build — успешно, 69 модулей.
Git
Code block


b0e2d53 feat: backend MVP, migrations, frontend types
adc3de6 teacher-ui: gate attachments behind feature flag, close Sprint 2 (BUGLOG)
Запушено в origin/feat/teacher-ui, дерево чистое.

Один нюанс: GET /api/users без параметров оставлен как прежний полный список для UsersPanel (иначе ломались старые тесты и админка); строгий фильтр работает при ?group_id= / ?unassigned=true.

Для проверки в браузере перезапусти backend на :8080 — текущий процесс может держать старый бинарь. Примеры:

bash


curl -s "localhost:8080/api/attachments?submission_id=1" -H "Authorization: Bearer <jwt>"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:8080/api/attachments/artifact-1 -H "Authorization: Bearer <jwt>"
curl -s -X POST localhost:8080/api/peer-reviews/1/award -H "Authorization: Bearer <jwt>" -d '{"reviewer_id":4,"amount":50}'
curl -s -X PATCH localhost:8080/api/users/3 -H "Authorization: Bearer <jwt>" -d '{"group_id":null}'
