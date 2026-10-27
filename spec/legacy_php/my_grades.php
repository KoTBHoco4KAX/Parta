<?php
require __DIR__ . '/config.php';
$user = require_login();
if ($user['role'] !== 'student') { header('Location: index.php'); exit; }
$isDark = $user['theme'] === 'dark';

// Достаём все оценки студента
$stmt = db()->prepare('
    SELECT s.id, s.grade, s.graded_at, s.teacher_comment, s.status,
           a.title, a.grade_max, a.deadline_at,
           u.name AS teacher_name,
           sub.name AS subject_name, sub.color AS subject_color
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN users u ON u.id = a.teacher_id
    LEFT JOIN subjects sub ON sub.id = a.subject_id
    WHERE s.student_id = ? AND s.status = "graded"
    ORDER BY s.graded_at DESC
');
$stmt->execute([$user['id']]);
$grades = $stmt->fetchAll();

// Общая статистика
$totalGraded = count($grades);
$sumGot = 0; $sumMax = 0;
foreach ($grades as $g) {
    $sumGot += (int)$g['grade'];
    $sumMax += (int)$g['grade_max'];
}
$avgPercent = $sumMax > 0 ? round($sumGot / $sumMax * 100, 1) : 0;
$avgBall    = $totalGraded > 0 ? round($sumGot / $totalGraded, 1) : 0;

// Ещё не проверенные
$stmt = db()->prepare('
    SELECT COUNT(*) FROM submissions
    WHERE student_id = ? AND status = "submitted"
');
$stmt->execute([$user['id']]);
$pending = (int)$stmt->fetchColumn();
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мои оценки</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
<?= impersonate_banner() ?>

<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-emerald-600">📋 Мои оценки</h1>
            <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Студент</span>
        </div>
        <div class="flex items-center gap-3">
            <a href="student.php" class="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">← К заданиям</a>
            <a href="logout.php" class="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white">Выйти</a>
        </div>
    </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6 space-y-6">

    <!-- Сводка -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Проверено работ</div>
            <div class="text-3xl font-bold text-indigo-600"><?= $totalGraded ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Ждут проверки</div>
            <div class="text-3xl font-bold text-amber-500"><?= $pending ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Средний балл</div>
            <div class="text-3xl font-bold text-emerald-600"><?= $avgBall ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Средний %</div>
            <div class="text-3xl font-bold text-emerald-600"><?= $avgPercent ?>%</div>
        </div>
    </div>

    <!-- Таблица оценок -->
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <?php if (!$grades): ?>
            <p class="p-6 text-slate-500">Оценок пока нет.</p>
        <?php else: ?>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-100 dark:bg-slate-900 text-left">
                        <tr>
                            <th class="px-4 py-3">Задание</th>
                            <th class="px-4 py-3">Предмет</th>
                            <th class="px-4 py-3">Преподаватель</th>
                            <th class="px-4 py-3">Балл</th>
                            <th class="px-4 py-3">%</th>
                            <th class="px-4 py-3">Дата проверки</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($grades as $g):
                            $pct = $g['grade_max'] > 0 ? round($g['grade'] / $g['grade_max'] * 100) : 0;
                            $color = $pct >= 80 ? 'text-emerald-600' : ($pct >= 60 ? 'text-amber-600' : 'text-red-500');
                        ?>
                            <tr class="border-t border-slate-200 dark:border-slate-700 align-top">
                                <td class="px-4 py-3">
                                    <div class="font-medium"><?= e($g['title']) ?></div>
                                    <?php if ($g['teacher_comment']): ?>
                                        <div class="text-xs text-slate-500 mt-1 whitespace-pre-wrap">💬 <?= e($g['teacher_comment']) ?></div>
                                    <?php endif; ?>
                                </td>
                                <td class="px-4 py-3">
                                    <?php if ($g['subject_name']): ?>
                                        <span class="text-xs px-2 py-0.5 rounded text-white" style="background:<?= e($g['subject_color']) ?>"><?= e($g['subject_name']) ?></span>
                                    <?php else: ?>
                                        <span class="text-slate-400">—</span>
                                    <?php endif; ?>
                                </td>
                                <td class="px-4 py-3"><?= e($g['teacher_name']) ?></td>
                                <td class="px-4 py-3 font-bold <?= $color ?>"><?= $g['grade'] ?> / <?= $g['grade_max'] ?></td>
                                <td class="px-4 py-3 font-medium <?= $color ?>"><?= $pct ?>%</td>
                                <td class="px-4 py-3 text-slate-500"><?= e($g['graded_at']) ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>
</main>

<script src="assets/app.js"></script>
</body>
</html>
