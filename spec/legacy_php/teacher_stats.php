<?php
require __DIR__ . '/config.php';
$user = require_login();
if (!in_array($user['role'], ['teacher','admin'], true)) { header('Location: index.php'); exit; }
$isDark = $user['theme'] === 'dark';

$teacherId = $user['role'] === 'admin' ? null : $user['id'];

// --- 1. Общие числа ---
if ($teacherId === null) {
    $totalAssignments = (int) db()->query('SELECT COUNT(*) FROM assignments')->fetchColumn();
    $totalStudents    = (int) db()->query("SELECT COUNT(*) FROM users WHERE role = 'student'")->fetchColumn();
    $totalSubmissions = (int) db()->query('SELECT COUNT(*) FROM submissions')->fetchColumn();
    $pending          = (int) db()->query("SELECT COUNT(*) FROM submissions WHERE status = 'submitted'")->fetchColumn();
    $avgStmt = db()->query("
        SELECT ROUND(AVG(s.grade / a.grade_max * 100), 1) AS avg_percent
        FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE s.status = 'graded' AND a.grade_max > 0
    ");
    $avgPercent = $avgStmt->fetchColumn() ?: 0;
} else {
    $stmt = db()->prepare('SELECT COUNT(*) FROM assignments WHERE teacher_id = ?');
    $stmt->execute([$teacherId]); $totalAssignments = (int) $stmt->fetchColumn();

    $stmt = db()->prepare("SELECT COUNT(DISTINCT student_id) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.teacher_id = ?");
    $stmt->execute([$teacherId]); $totalStudents = (int) $stmt->fetchColumn();

    $stmt = db()->prepare("SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.teacher_id = ?");
    $stmt->execute([$teacherId]); $totalSubmissions = (int) $stmt->fetchColumn();

    $stmt = db()->prepare("SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.teacher_id = ? AND s.status = 'submitted'");
    $stmt->execute([$teacherId]); $pending = (int) $stmt->fetchColumn();

    $stmt = db()->prepare("
        SELECT ROUND(AVG(s.grade / a.grade_max * 100), 1)
        FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE a.teacher_id = ? AND s.status = 'graded' AND a.grade_max > 0
    ");
    $stmt->execute([$teacherId]); $avgPercent = $stmt->fetchColumn() ?: 0;
}

// --- 2. Распределение по предметам ---
if ($teacherId === null) {
    $bySubject = db()->query("
        SELECT COALESCE(sub.name, 'Без предмета') AS name, COALESCE(sub.color, '#94a3b8') AS color,
               COUNT(DISTINCT a.id) AS assignments_cnt,
               COUNT(s.id) AS submissions_cnt,
               SUM(CASE WHEN s.status = 'graded' THEN 1 ELSE 0 END) AS graded_cnt
        FROM assignments a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        LEFT JOIN submissions s ON s.assignment_id = a.id
        GROUP BY sub.id
        ORDER BY assignments_cnt DESC
    ")->fetchAll();
} else {
    $stmt = db()->prepare("
        SELECT COALESCE(sub.name, 'Без предмета') AS name, COALESCE(sub.color, '#94a3b8') AS color,
               COUNT(DISTINCT a.id) AS assignments_cnt,
               COUNT(s.id) AS submissions_cnt,
               SUM(CASE WHEN s.status = 'graded' THEN 1 ELSE 0 END) AS graded_cnt
        FROM assignments a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        LEFT JOIN submissions s ON s.assignment_id = a.id
        WHERE a.teacher_id = ?
        GROUP BY sub.id
        ORDER BY assignments_cnt DESC
    ");
    $stmt->execute([$teacherId]);
    $bySubject = $stmt->fetchAll();
}

// --- 3. Распределение оценок (по %) ---
if ($teacherId === null) {
    $gradeBuckets = db()->query("
        SELECT
            SUM(CASE WHEN s.grade / a.grade_max >= 0.9 THEN 1 ELSE 0 END) AS b90,
            SUM(CASE WHEN s.grade / a.grade_max >= 0.75 AND s.grade / a.grade_max < 0.9 THEN 1 ELSE 0 END) AS b75,
            SUM(CASE WHEN s.grade / a.grade_max >= 0.6 AND s.grade / a.grade_max < 0.75 THEN 1 ELSE 0 END) AS b60,
            SUM(CASE WHEN s.grade / a.grade_max < 0.6 THEN 1 ELSE 0 END) AS below
        FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE s.status = 'graded' AND a.grade_max > 0
    ")->fetch();
} else {
    $stmt = db()->prepare("
        SELECT
            SUM(CASE WHEN s.grade / a.grade_max >= 0.9 THEN 1 ELSE 0 END) AS b90,
            SUM(CASE WHEN s.grade / a.grade_max >= 0.75 AND s.grade / a.grade_max < 0.9 THEN 1 ELSE 0 END) AS b75,
            SUM(CASE WHEN s.grade / a.grade_max >= 0.6 AND s.grade / a.grade_max < 0.75 THEN 1 ELSE 0 END) AS b60,
            SUM(CASE WHEN s.grade / a.grade_max < 0.6 THEN 1 ELSE 0 END) AS below
        FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE a.teacher_id = ? AND s.status = 'graded' AND a.grade_max > 0
    ");
    $stmt->execute([$teacherId]);
    $gradeBuckets = $stmt->fetch();
}
$b90 = (int)($gradeBuckets['b90'] ?? 0);
$b75 = (int)($gradeBuckets['b75'] ?? 0);
$b60 = (int)($gradeBuckets['b60'] ?? 0);
$below = (int)($gradeBuckets['below'] ?? 0);
$totalGraded = $b90 + $b75 + $b60 + $below;
$pct = fn($n) => $totalGraded > 0 ? round($n / $totalGraded * 100) : 0;

// --- 4. Топ-5 проблемных заданий (больше всего на проверке) ---
if ($teacherId === null) {
    $pendingByAssignment = db()->query("
        SELECT a.id, a.title, COUNT(s.id) AS cnt
        FROM assignments a
        JOIN submissions s ON s.assignment_id = a.id
        WHERE s.status = 'submitted'
        GROUP BY a.id
        ORDER BY cnt DESC LIMIT 5
    ")->fetchAll();
} else {
    $stmt = db()->prepare("
        SELECT a.id, a.title, COUNT(s.id) AS cnt
        FROM assignments a
        JOIN submissions s ON s.assignment_id = a.id
        WHERE a.teacher_id = ? AND s.status = 'submitted'
        GROUP BY a.id
        ORDER BY cnt DESC LIMIT 5
    ");
    $stmt->execute([$teacherId]);
    $pendingByAssignment = $stmt->fetchAll();
}
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Статистика преподавателя</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
<?= impersonate_banner() ?>

<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-indigo-600 dark:text-indigo-400">📊 Статистика</h1>
        <div class="flex items-center gap-3">
            <a href="<?= $user['role'] === 'admin' ? 'admin.php' : 'teacher.php' ?>"
               class="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200">← Назад</a>
            <a href="logout.php" class="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white">Выйти</a>
        </div>
    </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6 space-y-6">

    <!-- Сводка -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Заданий</div>
            <div class="text-3xl font-bold text-indigo-600"><?= $totalAssignments ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Студентов</div>
            <div class="text-3xl font-bold text-blue-600"><?= $totalStudents ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Всего сдач</div>
            <div class="text-3xl font-bold"><?= $totalSubmissions ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Ждут проверки</div>
            <div class="text-3xl font-bold text-amber-500"><?= $pending ?></div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div class="text-sm text-slate-500">Средний балл</div>
            <div class="text-3xl font-bold text-emerald-600"><?= $avgPercent ?>%</div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Распределение оценок -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 class="font-semibold mb-4">Распределение оценок</h2>
            <?php if ($totalGraded === 0): ?>
                <p class="text-slate-500 text-sm">Пока нет проверенных работ.</p>
            <?php else: ?>
                <?php
                $buckets = [
                    ['90–100%', $b90, $pct($b90), '#10b981'],
                    ['75–89%',  $b75, $pct($b75), '#3b82f6'],
                    ['60–74%',  $b60, $pct($b60), '#f59e0b'],
                    ['< 60%',   $below, $pct($below), '#ef4444'],
                ];
                foreach ($buckets as [$label, $cnt, $percent, $color]):
                ?>
                    <div class="mb-3">
                        <div class="flex justify-between text-sm mb-1">
                            <span><?= $label ?></span>
                            <span class="text-slate-500"><?= $cnt ?> (<?= $percent ?>%)</span>
                        </div>
                        <div class="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all" style="width: <?= $percent ?>%; background: <?= $color ?>"></div>
                        </div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <!-- По предметам -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 class="font-semibold mb-4">По предметам</h2>
            <?php if (!$bySubject): ?>
                <p class="text-slate-500 text-sm">Нет данных.</p>
            <?php else: ?>
                <?php foreach ($bySubject as $s): ?>
                    <div class="flex items-center justify-between mb-2 text-sm">
                        <div class="flex items-center gap-2">
                            <span class="w-3 h-3 rounded-full" style="background: <?= e($s['color']) ?>"></span>
                            <span><?= e($s['name']) ?></span>
                        </div>
                        <div class="text-slate-500">
                            заданий: <b><?= (int)$s['assignments_cnt'] ?></b> ·
                            сдач: <b><?= (int)$s['submissions_cnt'] ?></b> ·
                            оценено: <b><?= (int)$s['graded_cnt'] ?></b>
                        </div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>

    <!-- Топ заданий с непроверенными -->
    <?php if ($pendingByAssignment): ?>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h2 class="font-semibold mb-4">🔥 Топ заданий, ожидающих проверки</h2>
            <div class="space-y-2">
                <?php foreach ($pendingByAssignment as $p): ?>
                    <div class="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <span class="text-sm"><?= e($p['title']) ?></span>
                        <span class="text-sm font-semibold text-amber-600"><?= (int)$p['cnt'] ?> на проверке</span>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
    <?php endif; ?>
</main>

<script src="assets/app.js"></script>
</body>
</html>
