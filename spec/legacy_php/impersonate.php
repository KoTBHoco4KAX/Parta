<?php
require __DIR__ . '/config.php';

// Действие: start | stop
$action = $_GET['action'] ?? 'start';
$userId = (int)($_GET['user_id'] ?? 0);
$back   = $_GET['back'] ?? 'admin.php';

// Только реальный админ может impersonate (не «подменённый»)
$realAdminId = $_SESSION['admin_id'] ?? $_SESSION['user_id'] ?? 0;
$realAdmin = $realAdminId ? db()->prepare('SELECT id, role FROM users WHERE id = ?') : null;
if ($realAdmin) {
    $realAdmin->execute([$realAdminId]);
    $realAdminRow = $realAdmin->fetch();
    if (!$realAdminRow || $realAdminRow['role'] !== 'admin') {
        header('Location: index.php'); exit;
    }
}

if ($action === 'stop') {
    impersonate_stop();
    header('Location: admin.php');
    exit;
}

// action = start
if (!$userId) {
    header('Location: admin.php?err=no_user');
    exit;
}

// Проверим, что цель — существующий пользователь
$stmt = db()->prepare('SELECT id, role FROM users WHERE id = ?');
$stmt->execute([$userId]);
$target = $stmt->fetch();
if (!$target) {
    header('Location: admin.php?err=not_found');
    exit;
}

impersonate($userId);

// Куда идти после подмены
switch ($target['role']) {
    case 'student': header('Location: student.php'); exit;
    case 'teacher': header('Location: teacher.php'); exit;
    default:        header('Location: admin.php'); exit;
}
