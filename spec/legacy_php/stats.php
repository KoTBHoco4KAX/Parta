<?php
require __DIR__ . '/config.php';
$user = require_login();
$isDark = $user['theme'] === 'dark';

// Считаем статистику
$stmt = db()->prepare('SELECT status, COUNT(*) AS cnt FROM tasks WHERE user_id = ? GROUP BY status');
$stmt->execute([$user['id']]);
$byStatus = [];
foreach ($stmt->fetchAll() as $r) $byStatus[$r['status']] = (int)$r['cnt'];

$stmt = db()->prepare('
    SELECT COALESCE(s.name, "Без предмета") AS name, COALESCE(s.color, "#94a3b8") AS color, COUNT(*) AS cnt
    FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
    WHERE t.user_id = ? GROUP BY s.id ORDER BY cnt DESC
');
$stmt->execute([$user['id']]);
$bySubject = $stmt->fetchAll();

$total = array_sum($byStatus);
$done  = $byStatus['done'] ?? 0;

$stmt = db()->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND deadline_at < CURDATE() AND status != "done"');
$stmt->execute([$user['id']]);
$overdue = (int)$stmt->fetchColumn();
?>
<!DOCTYPE html>
<html lang="ru" class="<?= $isDark ? 'dark' : '' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Статистика — Study Kanban</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
</head>
<body class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">

<header class="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 class="text-xl font-bold text-indigo-600 dark:text-indigo-400">📊 Статистика</h1>
        <a href="index.php" class="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">← Назад к доске</a>
    </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Карточки-цифры -->
    <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div class="text-sm text-slate-500 dark:text-slate-400">Всего задач</div>
        <div class="text-4xl font-bold text-indigo-600 dark:text-indigo-400"><?= $total ?></div>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div class="text-sm text-slate-500 dark:text-slate-400">Выполнено</div>
        <div class="text-4xl font-bold text-emerald-500"><?= $done ?></div>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div class="text-sm text-slate-500 dark:text-slate-400">Просрочено</div>
        <div class="text-4xl font-bold text-red-500"><?= $overdue ?></div>
    </div>

    <!-- По статусам -->
    <div class="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 class="font-semibold mb-4">По статусам</h2>
        <?php
        $cols = ['inbox' => ['Входящие','#64748b'], 'in_progress' => ['В работе','#3b82f6'], 'review' => ['На проверке','#f59e0b'], 'done' => ['Готово','#10b981']];
        $max = max(1, max(array_values($byStatus) ?: [0]));
        foreach ($cols as $key => [$title, $color]):
            $cnt = $byStatus[$key] ?? 0;
            $pct = round($cnt / $max * 100);
        ?>
            <div class="mb-3">
                <div class="flex justify-between text-sm mb-1">
                    <span><?= $title ?></span><span class="text-slate-500"><?= $cnt ?></span>
                </div>
                <div class="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" style="width: <?= $pct ?>%; background: <?= $color ?>"></div>
                </div>
            </div>
        <?php endforeach; ?>
    </div>

    <!-- По предметам -->
    <div class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <h2 class="font-semibold mb-4">По предметам</h2>
        <?php if (!$bySubject): ?>
            <p class="text-slate-500 text-sm">Пока нет данных</p>
        <?php else: ?>
            <?php foreach ($bySubject as $row): ?>
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full" style="background: <?= e($row['color']) ?>"></span>
                        <span class="text-sm"><?= e($row['name']) ?></span>
                    </div>
                    <span class="text-sm font-semibold"><?= (int)$row['cnt'] ?></span>
                </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
</main>

</body>
</html>
