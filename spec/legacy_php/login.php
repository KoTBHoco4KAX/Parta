<?php
require __DIR__ . '/config.php';

// Уже вошли — на главную
if (current_user()) {
    header('Location: index.php');
    exit;
}

$error = '';
$mode  = $_GET['mode'] ?? 'login';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? 'login';
    $email  = trim($_POST['email'] ?? '');
    $pass   = (string)($_POST['password'] ?? '');
    $name   = trim($_POST['name'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Некорректный email';
    } elseif (strlen($pass) < 3) {
        $error = 'Пароль минимум 3 символа';
    } else {
        if ($action === 'register') {
            if ($name === '') {
                $error = 'Введите имя';
            } else {
                $stmt = db()->prepare('SELECT id FROM users WHERE email = ?');
                $stmt->execute([$email]);
                if ($stmt->fetch()) {
                    $error = 'Такой email уже зарегистрирован';
                } else {
                    $stmt = db()->prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
                    $stmt->execute([$email, password_hash($pass, PASSWORD_DEFAULT), $name]);
                    $_SESSION['user_id'] = (int)db()->lastInsertId();
                    header('Location: index.php');
                    exit;
                }
            }
        } else {
            $stmt = db()->prepare('SELECT id, password_hash FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $u = $stmt->fetch();
            if (!$u || !password_verify($pass, $u['password_hash'])) {
                $error = 'Неверный email или пароль';
            } else {
                $_SESSION['user_id'] = (int)$u['id'];
                header('Location: index.php');
                exit;
            }
        }
    }
    $mode = $action;
}
?>
<!DOCTYPE html>
<html lang="ru" class="">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вход — Study Kanban</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class' }</script>
<link rel="stylesheet" href="assets/app.css">
</head>
<body class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 p-4">
    <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">
        <h1 class="text-3xl font-bold text-center mb-2 text-slate-900 dark:text-white">Study Kanban</h1>
        <p class="text-center text-slate-500 dark:text-slate-400 mb-6">Управляй своей учёбой</p>

        <div class="flex mb-6 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <a href="?mode=login" class="flex-1 text-center py-2 rounded-md font-medium transition <?= $mode === 'login' ? 'bg-white dark:bg-slate-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300' ?>">Вход</a>
            <a href="?mode=register" class="flex-1 text-center py-2 rounded-md font-medium transition <?= $mode === 'register' ? 'bg-white dark:bg-slate-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300' ?>">Регистрация</a>
        </div>

        <?php if ($error): ?>
            <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                <?= e($error) ?>
            </div>
        <?php endif; ?>

        <form method="post" class="space-y-4">
            <input type="hidden" name="action" value="<?= e($mode) ?>">

            <?php if ($mode === 'register'): ?>
                <div>
                    <label class="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Имя</label>
                    <input type="text" name="name" required value="<?= e($_POST['name'] ?? '') ?>"
                           class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white">
                </div>
            <?php endif; ?>

            <div>
                <label class="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Email</label>
                <input type="email" name="email" required value="<?= e($_POST['email'] ?? '') ?>"
                       class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white">
            </div>

            <div>
                <label class="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Пароль</label>
                <input type="password" name="password" required
                       class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white">
            </div>

            <button type="submit"
                    class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition">
                <?= $mode === 'register' ? 'Создать аккаунт' : 'Войти' ?>
            </button>
        </form>
    </div>

    <script>
        if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    </script>
<script src="assets/app.js"></script>
</body>
</html>
