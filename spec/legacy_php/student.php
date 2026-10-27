<?php
require __DIR__ . '/config.php';
$user = require_login();
if ($user['role'] !== 'student') { header('Location: index.php'); exit; }
$isDark = $user['theme'] === 'dark';
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мои задания — Study Kanban</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
<style>
    .column-drop-over { background-color: rgba(99,102,241,0.08); }
    .card-dragging { opacity: 0.4; }
    .card { cursor: grab; }
    .card:active { cursor: grabbing; }
</style>
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
<?= impersonate_banner() ?>

<!-- Шапка -->
<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-indigo-600 dark:text-indigo-400">🎓 Мои задания</h1>
            <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Студент</span>
        </div>
        <div class="flex items-center gap-3">
            <a href="calendar.php" class="text-sm px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">📅 Календарь</a>
            <a href="my_grades.php" class="text-sm px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">📋 Мои оценки</a>
            <button onclick="toggleTheme()" class="text-sm px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">🌓</button>
            <span class="text-sm text-slate-500 dark:text-slate-400"><?= e($user['name']) ?></span>
            <a href="logout.php" class="text-sm px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white">Выйти</a>
        </div>
    </div>
</header>

<!-- Панель управления -->
<div class="max-w-7xl mx-auto px-4 py-4 flex flex-wrap gap-3 items-center">
    <input type="search" id="searchInput" placeholder="Поиск заданий..."
           class="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 w-64 outline-none focus:ring-2 focus:ring-indigo-500">
</div>

<!-- Доска -->
<main class="max-w-7xl mx-auto px-4 pb-8">
    <div id="board" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"></div>
</main>

<!-- Модалка задания -->
<div id="taskModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 space-y-4">
            <div class="flex items-start justify-between">
                <h2 id="taskTitle" class="text-xl font-bold pr-4"></h2>
                <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-500">
                <span id="taskTeacher"></span>
                <span id="taskDeadline"></span>
            </div>

            <div>
                <h3 class="font-semibold text-sm mb-1">📄 Описание от преподавателя</h3>
                <div id="taskDesc" class="text-sm bg-slate-100 dark:bg-slate-900 rounded-lg p-3 whitespace-pre-wrap break-words"></div>
            </div>

            <!-- Файлы преподавателя -->
            <div>
                <h3 class="font-semibold text-sm mb-1">📎 Файлы от преподавателя</h3>
                <div id="teacherFiles" class="space-y-1 text-sm"></div>
            </div>

            <!-- Моя работа -->
            <div id="workBlock">
                <h3 class="font-semibold text-sm mb-1">✍️ Моя работа</h3>
                <textarea id="workText" rows="5" placeholder="Напиши решение / комментарий..."
                          class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"></textarea>

                <div class="flex items-center justify-between mt-2 mb-2">
                    <h3 class="font-semibold text-sm">📎 Мои файлы</h3>
                    <label class="text-xs cursor-pointer text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                        + Загрузить файл
                        <input type="file" id="fileInput" class="hidden" onchange="uploadFile(this)">
                    </label>
                </div>
                <div id="myFiles" class="space-y-1 text-sm"></div>
                <div id="uploadProgress" class="hidden text-xs text-slate-500 mt-1"></div>

                <div class="flex gap-2 mt-4">
                    <button id="submitBtn" onclick="submitWork()"
                            class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">
                        📤 Отправить на проверку
                    </button>
                </div>
            </div>

            <!-- Результат проверки -->
            <div id="gradeBlock" class="hidden bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                <h3 class="font-semibold text-sm mb-2 text-emerald-700 dark:text-emerald-400">✅ Проверено</h3>
                <div class="text-2xl font-bold text-emerald-600 mb-1"><span id="gradeVal"></span> / <span id="gradeMax"></span></div>
                <div id="gradeComment" class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap"></div>
            </div>

            <!-- Комментарии -->
            <div>
                <h3 class="font-semibold text-sm mb-2">💬 Обсуждение</h3>
                <div id="commentsList" class="space-y-2 mb-3 text-sm"></div>
                <div class="flex gap-2">
                    <input type="text" id="commentInput" placeholder="Написать..."
                           class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none text-sm">
                    <button type="button" onclick="sendComment()"
                            class="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm">Отправить</button>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
let BOARD = [];
let CURRENT = null;
const COLUMNS = [
    { key: 'new',         title: 'Новые',      color: '#64748b' },
    { key: 'in_progress', title: 'В работе',   color: '#3b82f6' },
    { key: 'submitted',   title: 'На проверке',color: '#f59e0b' },
    { key: 'graded',      title: 'Проверено',  color: '#10b981' },
];

async function loadBoard() {
    const res = await fetch('api.php?action=student_board');
    const json = await res.json();
    BOARD = json.data || [];
    renderBoard();
}

function renderBoard() {
    const board = document.getElementById('board');
    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    board.innerHTML = '';

    for (const col of COLUMNS) {
        const items = BOARD
            .filter(t => t.status === col.key)
            .filter(t => !search || t.title.toLowerCase().includes(search) || (t.description||'').toLowerCase().includes(search));

        const colEl = document.createElement('div');
        colEl.className = 'bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700';
        colEl.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background:${col.color}"></span>
                    <h3 class="font-semibold">${col.title}</h3>
                </div>
                <span class="text-xs text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">${items.length}</span>
            </div>
            <div class="space-y-2 min-h-[100px] task-list"></div>
        `;
        const list = colEl.querySelector('.task-list');
        list.innerHTML = items.map(t => renderCard(t)).join('');
        board.appendChild(colEl);

        list.addEventListener('dragover', e => { e.preventDefault(); colEl.classList.add('column-drop-over'); });
        list.addEventListener('dragleave', () => colEl.classList.remove('column-drop-over'));
        list.addEventListener('drop', async e => {
            e.preventDefault();
            colEl.classList.remove('column-drop-over');
            const subId = Number(e.dataTransfer.getData('subId'));
            await moveSub(subId, col.key);
        });
    }
}

function renderCard(t) {
    const now = new Date(); now.setHours(0,0,0,0);
    const dl = t.deadline_at ? new Date(t.deadline_at) : null;
    const isOverdue = dl && dl < now && t.status !== 'graded';

    return `
        <div class="card bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700 hover:shadow-md transition"
             draggable="${t.status === 'new' || t.status === 'in_progress' ? 'true' : 'false'}"
             data-sub-id="${t.submission_id}" onclick="openModal(${t.submission_id})">
            <div class="font-medium text-sm mb-1 break-words">${escapeHtml(t.title)}</div>
            <div class="text-[11px] text-slate-500 mb-1">${escapeHtml(t.teacher_name)}</div>
            ${dl ? `<div class="text-[11px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-500'}">📅 ${t.deadline_at}</div>` : ''}
            ${t.status === 'graded' ? `<div class="text-[11px] mt-1 text-emerald-600 font-semibold">✅ ${t.grade} / ${t.grade_max}</div>` : ''}
        </div>
    `;
}

document.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    if (!card || card.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
    e.dataTransfer.setData('subId', card.dataset.subId);
    card.classList.add('card-dragging');
});
document.addEventListener('dragend', e => {
    const card = e.target.closest('.card');
    if (card) card.classList.remove('card-dragging');
});

async function moveSub(subId, newStatus) {
    if (!['new','in_progress'].includes(newStatus)) {
        alert('Сдавать работу нужно кнопкой "Отправить на проверку" в карточке');
        return;
    }
    const item = BOARD.find(t => t.submission_id === subId);
    if (!item || item.status === newStatus) return;
    const old = item.status;
    item.status = newStatus;
    renderBoard();
    const res = await fetch('api.php?action=move_submission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: subId, status: newStatus })
    });
    if (!res.ok) { item.status = old; renderBoard(); alert('Ошибка'); }
}

async function openModal(subId) {
    const res = await fetch('api.php?action=submission_detail&id=' + subId);
    const json = await res.json();
    if (!res.ok) { alert(json.error || 'Ошибка'); return; }
    CURRENT = json.data;

    document.getElementById('taskTitle').textContent = CURRENT.title;
    document.getElementById('taskTeacher').textContent = '👤 ' + CURRENT.student_name === '' ? '' : '';
    // показать препода
    document.getElementById('taskTeacher').textContent = '';
    document.getElementById('taskDeadline').textContent = CURRENT.deadline_at ? ('📅 до ' + CURRENT.deadline_at) : '';
    document.getElementById('taskDesc').textContent = CURRENT.assignment_description || '—';

    // файлы препода — их надо подгрузить через список
    // (упростим: файлы задания подгрузим ниже отдельным запросом по assignment)
    const assignRes = await fetch('api.php?action=assignment_detail&id=' + CURRENT.assignment_id);
    // assignment_detail доступен только преподу — обойдём: используем list_files с owner_type=assignment
    const filesAssignRes = await fetch('api.php?action=list_files&owner_type=assignment&owner_id=' + CURRENT.assignment_id);
    if (filesAssignRes.ok) {
        const fa = await filesAssignRes.json();
        renderFilesInto('teacherFiles', fa.data || [], false);
    } else {
        document.getElementById('teacherFiles').innerHTML = '<span class="text-xs text-slate-400">—</span>';
    }

    // моя работа
    document.getElementById('workText').value = CURRENT.work_text || '';
    renderFilesInto('myFiles', CURRENT.files || [], true);

    // оценка
    if (CURRENT.status === 'graded') {
        document.getElementById('gradeBlock').classList.remove('hidden');
        document.getElementById('gradeVal').textContent = CURRENT.grade;
        document.getElementById('gradeMax').textContent = CURRENT.grade_max;
        document.getElementById('gradeComment').textContent = CURRENT.teacher_comment || '(без комментария)';
    } else {
        document.getElementById('gradeBlock').classList.add('hidden');
    }

    // кнопка сдачи: только если new/in_progress или (graded && allow_resubmit)
    const btn = document.getElementById('submitBtn');
    if (CURRENT.status === 'submitted') {
        btn.textContent = '⏳ Ожидает проверки';
        btn.disabled = true;
        btn.classList.add('opacity-60');
    } else if (CURRENT.status === 'graded' && !CURRENT.allow_resubmit) {
        btn.textContent = '✅ Уже проверено';
        btn.disabled = true;
        btn.classList.add('opacity-60');
    } else {
        btn.textContent = '📤 Отправить на проверку';
        btn.disabled = false;
        btn.classList.remove('opacity-60');
    }

    // комменты
    renderComments(CURRENT.comments || []);

    document.getElementById('taskModal').classList.remove('hidden');
}

function renderFilesInto(elementId, files, canDelete) {
    const el = document.getElementById(elementId);
    if (!files.length) { el.innerHTML = '<div class="text-xs text-slate-400">—</div>'; return; }
    el.innerHTML = files.map(f => `
        <div class="flex items-center justify-between gap-2 py-1">
            <a href="${f.url}" target="_blank" class="text-indigo-600 dark:text-indigo-400 hover:underline truncate">📄 ${escapeHtml(f.filename)}</a>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs text-slate-400">${f.human}</span>
                ${canDelete ? `<button onclick="deleteFile(${f.id})" class="text-red-500 hover:text-red-700 text-xs">✕</button>` : ''}
            </div>
        </div>
    `).join('');
}

function closeModal() {
    document.getElementById('taskModal').classList.add('hidden');
    CURRENT = null;
}

async function uploadFile(input) {
    const file = input.files[0];
    if (!file || !CURRENT) return;

    const fd = new FormData();
    fd.append('owner_type', 'submission');
    fd.append('owner_id', CURRENT.id);
    fd.append('file', file);

    const prog = document.getElementById('uploadProgress');
    prog.classList.remove('hidden'); prog.textContent = 'Загрузка...';

    const res = await fetch('upload.php', { method: 'POST', body: fd });
    const json = await res.json();
    prog.textContent = ''; prog.classList.add('hidden'); input.value = '';

    if (res.ok) {
        const refresh = await fetch('api.php?action=submission_detail&id=' + CURRENT.id).then(r => r.json());
        CURRENT = refresh.data;
        renderFilesInto('myFiles', CURRENT.files || [], true);
    } else alert('Ошибка: ' + (json.error || 'неизвестно'));
}

async function deleteFile(id) {
    if (!confirm('Удалить файл?')) return;
    const res = await fetch('api.php?action=delete_file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        const refresh = await fetch('api.php?action=submission_detail&id=' + CURRENT.id).then(r => r.json());
        CURRENT = refresh.data;
        renderFilesInto('myFiles', CURRENT.files || [], true);
    }
}

async function submitWork() {
    if (!CURRENT) return;
    const text = document.getElementById('workText').value;
    if (!confirm('Отправить работу на проверку? После этого редактирование будет недоступно (если препод не разрешил пересдачу).')) return;
    const res = await fetch('api.php?action=submit_work', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: CURRENT.id, work_text: text })
    });
    if (res.ok) { closeModal(); await loadBoard(); }
    else { const j = await res.json(); alert(j.error || 'Ошибка'); }
}

// ---- Комментарии ----
function renderComments(rows) {
    const el = document.getElementById('commentsList');
    if (!rows.length) { el.innerHTML = '<div class="text-xs text-slate-400">Нет комментариев</div>'; return; }
    el.innerHTML = rows.map(c => `
        <div class="bg-slate-100 dark:bg-slate-900 rounded-lg p-2">
            <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span class="font-medium">${escapeHtml(c.author)} <span class="text-[10px] opacity-60">(${c.role})</span></span>
                <span>${c.created_at}</span>
            </div>
            <div class="text-sm break-words">${escapeHtml(c.body)}</div>
        </div>
    `).join('');
}

async function sendComment() {
    if (!CURRENT) return;
    const input = document.getElementById('commentInput');
    const body = input.value.trim();
    if (!body) return;
    const res = await fetch('api.php?action=add_comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: CURRENT.id, body })
    });
    if (res.ok) {
        input.value = '';
        const refresh = await fetch('api.php?action=submission_detail&id=' + CURRENT.id).then(r => r.json());
        CURRENT = refresh.data;
        renderComments(CURRENT.comments || []);
    }
}

// ---- Тема ----
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    fetch('api.php?action=set_theme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
    });
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
}

document.getElementById('searchInput').addEventListener('input', renderBoard);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });

loadBoard();
</script>
<script src="assets/app.js"></script>
</body>
</html>
