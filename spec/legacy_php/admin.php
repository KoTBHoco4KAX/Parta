<?php
require __DIR__ . '/config.php';
$user = require_login();
if ($user['role'] !== 'admin') { header('Location: index.php'); exit; }
$isDark = $user['theme'] === 'dark';
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Админка</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
<?= impersonate_banner() ?>

<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-red-500">👑 Админка</h1>
        <div class="flex flex-wrap gap-2">
            <a href="calendar.php" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-500 text-white">📅 Календарь</a>
            <a href="teacher_stats.php" class="text-sm px-3 py-1.5 rounded-lg bg-emerald-500 text-white">📊 Статистика</a>
            <a href="export_grades.php" class="text-sm px-3 py-1.5 rounded-lg bg-slate-600 text-white">📤 CSV</a>
            <a href="logout.php" class="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white">Выйти</a>
        </div>
    </div>
    <div class="max-w-7xl mx-auto px-4 pb-3 flex items-center gap-3 flex-wrap">
        <span class="text-sm text-slate-500">Смотреть как:</span>
        <select id="impersonateSelect" class="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm">
            <option value="">— выбери —</option>
            <optgroup label="Студенты">
                <?php foreach (db()->query("SELECT id, name FROM users WHERE role='student' ORDER BY name") as $s): ?>
                    <option value="<?= $s['id'] ?>"><?= e($s['name']) ?></option>
                <?php endforeach; ?>
            </optgroup>
            <optgroup label="Преподаватели">
                <?php foreach (db()->query("SELECT id, name FROM users WHERE role='teacher' ORDER BY name") as $t): ?>
                    <option value="<?= $t['id'] ?>"><?= e($t['name']) ?></option>
                <?php endforeach; ?>
            </optgroup>
        </select>
        <button onclick="impersonateGo()" class="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white">👁 Открыть</button>
    </div>
</header>

<!-- Вкладки -->
<div class="max-w-7xl mx-auto px-4 pt-4">
    <div class="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        <button onclick="setTab('users')" id="tab-users" class="px-4 py-2 rounded-md font-medium text-sm bg-white dark:bg-slate-900 shadow">👥 Пользователи</button>
        <button onclick="setTab('groups')" id="tab-groups" class="px-4 py-2 rounded-md font-medium text-sm">📚 Группы</button>
    </div>
</div>

<main class="max-w-7xl mx-auto px-4 py-4">

    <!-- Вкладка: Пользователи -->
    <section id="pane-users">
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table class="w-full text-sm">
                <thead class="bg-slate-100 dark:bg-slate-900 text-left">
                    <tr>
                        <th class="px-4 py-2">ID</th>
                        <th class="px-4 py-2">Имя</th>
                        <th class="px-4 py-2">Email</th>
                        <th class="px-4 py-2">Роль</th>
                        <th class="px-4 py-2">Статус</th>
                        <th class="px-4 py-2">Действия</th>
                    </tr>
                </thead>
                <tbody id="usersTable"></tbody>
            </table>
        </div>
    </section>

    <!-- Вкладка: Группы -->
    <section id="pane-groups" class="hidden">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold">Учебные группы</h2>
            <button onclick="openGroupModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow">+ Создать группу</button>
        </div>
        <div id="groupsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </section>
</main>

<!-- Модалка группы -->
<div id="groupModal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div class="flex justify-between items-start">
            <h2 id="groupModalTitle" class="text-xl font-bold">Группа</h2>
            <button onclick="closeGroupModal()" class="text-slate-400 hover:text-slate-600 text-2xl">×</button>
        </div>

        <form id="groupForm" onsubmit="saveGroup(event)" class="space-y-4">
            <input type="hidden" name="id" id="groupId">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label class="block text-sm font-medium mb-1">Название *</label>
                    <input type="text" name="name" id="groupName" required class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Год набора</label>
                    <input type="number" name="year_start" id="groupYear" min="2000" max="2100" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Куратор</label>
                    <select name="curator_id" id="groupCurator" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 outline-none">
                        <option value="">— нет —</option>
                    </select>
                </div>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Сохранить</button>
                <button type="button" id="deleteGroupBtn" onclick="deleteGroup()" class="hidden px-4 py-2 bg-red-500 text-white rounded-lg">Удалить</button>
                <button type="button" onclick="closeGroupModal()" class="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg">Отмена</button>
            </div>
        </form>

        <!-- Студенты и преподы (только для редактирования) -->
        <div id="groupExtras" class="hidden border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
            <div>
                <h3 class="font-semibold text-sm mb-2">👥 Студенты в группе</h3>
                <div id="groupStudents" class="space-y-1 mb-2 text-sm"></div>
                <div class="flex gap-2">
                    <select id="studentToAdd" class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm outline-none">
                        <option value="">— выбрать студента —</option>
                    </select>
                    <button type="button" onclick="addStudentToGroup()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Добавить</button>
                </div>
            </div>
            <div>
                <h3 class="font-semibold text-sm mb-2">👨‍🏫 Преподаватели группы</h3>
                <div id="groupTeachers" class="space-y-1 mb-2 text-sm"></div>
                <div class="flex gap-2">
                    <select id="teacherToAdd" class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm outline-none">
                        <option value="">— выбрать преподавателя —</option>
                    </select>
                    <button type="button" onclick="addTeacherToGroup()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Добавить</button>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
let USERS = [];
let GROUPS = [];
let ALL_STUDENTS = [];
let ALL_TEACHERS = [];
let CURRENT_GROUP = null;

// === Вкладки ===
function setTab(name) {
    document.getElementById('pane-users').classList.toggle('hidden', name !== 'users');
    document.getElementById('pane-groups').classList.toggle('hidden', name !== 'groups');
    ['users','groups'].forEach(n => {
        const t = document.getElementById('tab-' + n);
        t.classList.toggle('bg-white', n === name);
        t.classList.toggle('dark:bg-slate-900', n === name);
        t.classList.toggle('shadow', n === name);
    });
    if (name === 'groups') loadGroups();
}

function impersonateGo() {
    const id = document.getElementById('impersonateSelect').value;
    if (!id) { alert('Выбери пользователя'); return; }
    location.href = 'impersonate.php?action=start&user_id=' + encodeURIComponent(id);
}

// === Пользователи ===
async function loadUsers() {
    const res = await fetch('api.php?action=admin_users');
    const j = await res.json();
    USERS = j.data || [];
    ALL_STUDENTS = USERS.filter(u => u.role === 'student');
    ALL_TEACHERS = USERS.filter(u => u.role === 'teacher');

    document.getElementById('usersTable').innerHTML = USERS.map(u => `
        <tr class="border-t border-slate-200 dark:border-slate-700">
            <td class="px-4 py-2">${u.id}</td>
            <td class="px-4 py-2">${esc(u.name)}</td>
            <td class="px-4 py-2">${esc(u.email)}</td>
            <td class="px-4 py-2">
                <select onchange="setRole(${u.id}, this.value)" class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900">
                    <option value="student" ${u.role==='student'?'selected':''}>Студент</option>
                    <option value="teacher" ${u.role==='teacher'?'selected':''}>Преподаватель</option>
                    <option value="admin"   ${u.role==='admin'?'selected':''}>Админ</option>
                </select>
            </td>
            <td class="px-4 py-2">${u.blocked == 1 ? '<span class="text-red-500">🚫</span>' : '<span class="text-emerald-500">✅</span>'}</td>
            <td class="px-4 py-2">
                <button onclick="toggleBlock(${u.id}, ${u.blocked == 1 ? 0 : 1})" class="px-2 py-1 rounded text-xs ${u.blocked == 1 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}">
                    ${u.blocked == 1 ? 'Разблок.' : 'Блок.'}
                </button>
            </td>
        </tr>
    `).join('');
}

async function setRole(id, role) {
    const res = await fetch('api.php?action=admin_set_role', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({id, role})
    });
    if (!res.ok) { alert((await res.json()).error || 'Ошибка'); loadUsers(); }
    else loadUsers();
}

async function toggleBlock(id, blocked) {
    await fetch('api.php?action=admin_block', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({id, blocked})
    });
    loadUsers();
}

// === Группы ===
async function loadGroups() {
    if (!USERS.length) await loadUsers();
    const res = await fetch('api.php?action=groups_list');
    const j = await res.json();
    GROUPS = j.data || [];

    const el = document.getElementById('groupsList');
    if (!GROUPS.length) { el.innerHTML = '<p class="text-slate-500">Групп пока нет</p>'; return; }

    el.innerHTML = GROUPS.map(g => `
        <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-md"
             onclick="openGroupModal(${g.id})">
            <div class="flex justify-between items-start mb-2">
                <div class="font-semibold text-lg">${esc(g.name)}</div>
                ${g.year_start ? `<div class="text-xs text-slate-500">${g.year_start}</div>` : ''}
            </div>
            ${g.curator_name ? `<div class="text-xs text-slate-500 mb-2">Куратор: ${esc(g.curator_name)}</div>` : ''}
            <div class="flex gap-3 text-xs text-slate-500">
                <span>👥 ${g.students_cnt} студентов</span>
                <span>👨‍🏫 ${g.teachers_cnt} препод.</span>
            </div>
        </div>
    `).join('');
}

async function openGroupModal(id = null) {
    if (!USERS.length) await loadUsers();

    const modal = document.getElementById('groupModal');
    const form  = document.getElementById('groupForm');
    form.reset();
    CURRENT_GROUP = null;

    // Наполним селект куратора
    const curator = document.getElementById('groupCurator');
    curator.innerHTML = '<option value="">— нет —</option>' +
        ALL_TEACHERS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

    if (id) {
        const res = await fetch('api.php?action=groups_detail&id=' + id);
        const j = await res.json();
        CURRENT_GROUP = j.data;
        document.getElementById('groupModalTitle').textContent = 'Редактировать группу';
        document.getElementById('groupId').value   = CURRENT_GROUP.id;
        document.getElementById('groupName').value = CURRENT_GROUP.name;
        document.getElementById('groupYear').value = CURRENT_GROUP.year_start || '';
        document.getElementById('groupCurator').value = CURRENT_GROUP.curator_id || '';
        document.getElementById('deleteGroupBtn').classList.remove('hidden');
        document.getElementById('groupExtras').classList.remove('hidden');
        renderGroupStudents();
        renderGroupTeachers();
        fillStudentSelect();
        fillTeacherSelect();
    } else {
        document.getElementById('groupModalTitle').textContent = 'Новая группа';
        document.getElementById('groupId').value = '';
        document.getElementById('deleteGroupBtn').classList.add('hidden');
        document.getElementById('groupExtras').classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

function closeGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
    CURRENT_GROUP = null;
}

async function saveGroup(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get('id');
    const payload = {
        id: id ? parseInt(id) : undefined,
        name: fd.get('name'),
        year_start: parseInt(fd.get('year_start')) || null,
        curator_id: parseInt(fd.get('curator_id')) || null,
    };
    const action = id ? 'groups_update' : 'groups_create';
    const res = await fetch('api.php?action=' + action, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    });
    if (res.ok) { closeGroupModal(); loadGroups(); }
    else { const j = await res.json(); alert(j.error || 'Ошибка'); }
}

async function deleteGroup() {
    if (!CURRENT_GROUP) return;
    if (!confirm('Удалить группу? Студенты останутся, но потеряют привязку.')) return;
    const res = await fetch('api.php?action=groups_delete', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({id: CURRENT_GROUP.id})
    });
    if (res.ok) { closeGroupModal(); loadGroups(); }
}

function renderGroupStudents() {
    const el = document.getElementById('groupStudents');
    if (!CURRENT_GROUP.students.length) { el.innerHTML = '<span class="text-xs text-slate-400">Нет студентов</span>'; return; }
    el.innerHTML = CURRENT_GROUP.students.map(s => `
        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 rounded px-2 py-1">
            <span>${esc(s.name)} <span class="text-xs text-slate-400">${esc(s.email)}</span></span>
            <button onclick="removeStudent(${s.id})" class="text-red-500 text-xs">✕</button>
        </div>
    `).join('');
}

function renderGroupTeachers() {
    const el = document.getElementById('groupTeachers');
    if (!CURRENT_GROUP.teachers.length) { el.innerHTML = '<span class="text-xs text-slate-400">Нет преподавателей</span>'; return; }
    el.innerHTML = CURRENT_GROUP.teachers.map(t => `
        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900 rounded px-2 py-1">
            <span>${esc(t.name)}</span>
            <button onclick="removeTeacher(${t.id})" class="text-red-500 text-xs">✕</button>
        </div>
    `).join('');
}

function fillStudentSelect() {
    const inGroup = new Set(CURRENT_GROUP.students.map(s => s.id));
    const sel = document.getElementById('studentToAdd');
    sel.innerHTML = '<option value="">— выбрать студента —</option>' +
        ALL_STUDENTS.filter(s => !inGroup.has(s.id))
                    .map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

function fillTeacherSelect() {
    const inGroup = new Set(CURRENT_GROUP.teachers.map(t => t.id));
    const sel = document.getElementById('teacherToAdd');
    sel.innerHTML = '<option value="">— выбрать преподавателя —</option>' +
        ALL_TEACHERS.filter(t => !inGroup.has(t.id))
                    .map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}

async function addStudentToGroup() {
    const sid = document.getElementById('studentToAdd').value;
    if (!sid) return;
    await fetch('api.php?action=groups_add_student', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({group_id: CURRENT_GROUP.id, student_id: parseInt(sid)})
    });
    const res = await fetch('api.php?action=groups_detail&id=' + CURRENT_GROUP.id);
    CURRENT_GROUP = (await res.json()).data;
    renderGroupStudents();
    fillStudentSelect();
}

async function removeStudent(sid) {
    if (!confirm('Убрать студента из группы?')) return;
    await fetch('api.php?action=groups_remove_student', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({group_id: CURRENT_GROUP.id, student_id: sid})
    });
    const res = await fetch('api.php?action=groups_detail&id=' + CURRENT_GROUP.id);
    CURRENT_GROUP = (await res.json()).data;
    renderGroupStudents();
    fillStudentSelect();
}

async function addTeacherToGroup() {
    const tid = document.getElementById('teacherToAdd').value;
    if (!tid) return;
    await fetch('api.php?action=groups_assign_teacher', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({group_id: CURRENT_GROUP.id, teacher_id: parseInt(tid), action: 'add'})
    });
    const res = await fetch('api.php?action=groups_detail&id=' + CURRENT_GROUP.id);
    CURRENT_GROUP = (await res.json()).data;
    renderGroupTeachers();
    fillTeacherSelect();
}

async function removeTeacher(tid) {
    if (!confirm('Убрать преподавателя из группы?')) return;
    await fetch('api.php?action=groups_assign_teacher', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({group_id: CURRENT_GROUP.id, teacher_id: tid, action: 'remove'})
    });
    const res = await fetch('api.php?action=groups_detail&id=' + CURRENT_GROUP.id);
    CURRENT_GROUP = (await res.json()).data;
    renderGroupTeachers();
    fillTeacherSelect();
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

loadUsers();
</script>
<script src="assets/app.js"></script>
</body>
</html>