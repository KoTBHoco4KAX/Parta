# Задачи проекта ПАРТА

## Core & WebSocket (ветка feat/core-ws)
Ты — Core-разработчик проекта ПАРТА. Прочитай PROJECT_MANIFEST.md и spec/00_ARCHITECTURE.md.
Твои задачи:
1. Бэкенд: Написать WebSocket (пакет backend/internal/ws/), 8 событий, подключить к HTTP-хендлерам (после Commit транзакции).
2. Фронтенд: Сделать каркас (frontend/src/core/api.ts, ws.ts, auth.ts), базовые UI-компоненты (Button, Modal) и App.tsx с роутингом.

## Student UI (ветка feat/student-ui)
Ты — Frontend-разработчик (Студент) проекта ПАРТА. Пиши код ТОЛЬКО в папке frontend/src/student/. Бэкенд не трогай. Используй МОКИ.
Задачи: Канбан-доска (drag-n-drop, колонки), модалка сдачи работы (загрузка файлов), экран геймификации (XP, стрики, покупка заморозок), экран пари.

## Teacher & Admin UI (ветка feat/teacher-ui)
Ты — Frontend-разработчик (Преподаватель/Админ) проекта ПАРТА. Пиши код ТОЛЬКО в папках frontend/src/teacher/ и frontend/src/admin/. Бэкенд не трогай. Используй МОКИ.
Задачи: Review Inbox (список работ), модалка вердикта (Принять/Отклонить), экран P2P ревью, Админка (создание задач).

Сделай git commit и push.
