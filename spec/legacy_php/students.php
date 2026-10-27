<?php
require __DIR__ . '/config.php';
$user = require_login();
if (!in_array($user['role'], ['teacher','admin'], true)) { header('Location: index.php'); exit; }
$isDark = $user['theme'] === 'dark';

// Список студентов + статистика
if ($user['role'] === 'admin') {
    $stmt = db()->query("
        SELECT u.id, u.email, u.name, u.group_name,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id) AS total_tasks,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id AND status = 'submitted') AS pending,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id AND status = 'graded') AS graded,
               (SELECT ROUND(AVG(s2.grade / a2.grade_max * 100), 1)
                  FROM submissions s2
                  JOIN assignments a2 ON a2.id = s2.assignment_id
                  WHERE s2.student_id = u.id AND s2.status = 'graded' AND a2.grade_max > 0
               ) AS avg_percent
        FROM users u
        WHERE u.role = 'student'
        ORDER BY u.name
    ");
} else {
    $stmt = db()->prepare("
        SELECT u.id, u.email, u.name, u.group_name,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id) AS total_tasks,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id AND status = 'submitted') AS pending,
               (SELECT COUNT(*) FROM submissions WHERE student_id = u.id AND status = 'graded') AS graded,
               (SELECT ROUND(AVG(s2.grade / a2.grade_max * 100), 1)
                  FROM submissions s2
                  JOIN assignments a2 ON a2.id = s2.assignment_id
                  WHERE s2.student_id = u.id AND s2.status = 'graded' AND a2.grade_max > 0
               ) AS avg_percent
        FROM users u
        JOIN teacher_students ts ON ts.student_id = u.id
        WHERE ts.teacher_id = ?
        ORDER BY u.name
    ");
    $stmt->execute([$user['id']]);
}
$students = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Студенты</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
<?= impersonate_banner() ?>

<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-amber-500">🎓 Студенты</h1>
            <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <?= $user['role'] === 'admin' ? 'Админ' : 'Преподаватель' ?>
            </span>
        </div>
        <div class="flex items-center gap-3">
            <a href="<?= $user['role'] === 'admin' ? 'admin.php' : 'teacher.php' ?>"
               class="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">
                ← Назад
            </a>
            <a href="logout.php" class="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white">Выйти</a>
        </div>
    </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6">

    <?php if (!$students): ?>
        <p class="text-slate-500">
            <?= $user['role'] === 'admin'
                ? 'В системе нет студентов.'
                : 'Пока нет привязанных студентов. Обратись к админу, чтобы он привязал студентов к тебе.' ?>
        </p>
    <?php else: ?>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <?php foreach ($students as $s):
                $avg = $s['avg_percent'];
                $avgColor = $avg === null ? 'text-slate-400'
                          : ($avg >= 80 ? 'text-emerald-600'
                          : ($avg >= 60 ? 'text-amber-600' : 'text-red-500'));
            ?>
                <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
                    <div class="font-semibold mb-1"><?= e($s['name']) ?></div>
                    <div class="text-sm text-slate-500 mb-3">
                        <?= e($s['email']) ?>
                        <?php if ($s['group_name']): ?>
                            · <span class="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700"><?= e($s['group_name']) ?></span>
                        <?php endif; ?>
                    </div>

                    <div class="grid grid-cols-3 gap-2 text-center mb-3">
                        <div class="bg-slate-50 dark:bg-slate-900 rounded-lg py-2">
                            <div class="text-xs text-slate-500">Всего</div>
                            <div class="text-lg font-bold"><?= (int)$s['total_tasks'] ?></div>
                        </div>
                        <div class="bg-amber-50 dark:bg-amber-900/20 rounded-lg py-2">
                            <div class="text-xs text-amber-600">Проверка</div>
                            <div class="text-lg font-bold text-amber-600"><?= (int)$s['pending'] ?></div>
                        </div>
                        <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg py-2">
                            <div class="text-xs text-emerald-600">Оценено</div>
                            <div class="text-lg font-bold text-emerald-600"><?= (int)$s['graded'] ?></div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between text-sm">
                        <span class="text-slate-500">Средний балл:</span>
                        <span class="font-bold <?= $avgColor ?>">
                            <?= $avg !== null ? $avg . '%' : '—' ?>
                        </span>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</main>

<script src="assets/app.js"></script>
</body>
</html>
