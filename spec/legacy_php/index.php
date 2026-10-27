<?php
require __DIR__ . '/config.php';
$user = require_login();

// Если явно просят роль — используем её, иначе дефолт для роли
$as = $_GET['as'] ?? null;

if ($as === 'student') { header('Location: student.php'); exit; }
if ($as === 'teacher') { header('Location: teacher.php'); exit; }

switch ($user['role']) {
    case 'admin':
        // Админ идёт в админку, но может посмотреть доску через ?as=student
        header('Location: admin.php'); exit;
    case 'teacher':
        header('Location: teacher.php'); exit;
    default:
        header('Location: student.php'); exit;
}
