<?php
require __DIR__ . '/config.php';
$user = require_login();
if (!in_array($user['role'], ['teacher','admin'], true)) { header('Location: index.php'); exit; }

if ($user['role'] === 'admin') {
    $stmt = db()->query("
        SELECT u.name AS student, u.email AS student_email, u.group_name,
               a.title AS assignment, a.grade_max,
               s.grade, s.graded_at, s.teacher_comment,
               t.name AS teacher,
               sub.name AS subject
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN users u ON u.id = s.student_id
        JOIN users t ON t.id = a.teacher_id
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE s.status = 'graded'
        ORDER BY u.name, a.title
    ");
} else {
    $stmt = db()->prepare("
        SELECT u.name AS student, u.email AS student_email, u.group_name,
               a.title AS assignment, a.grade_max,
               s.grade, s.graded_at, s.teacher_comment,
               t.name AS teacher,
               sub.name AS subject
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN users u ON u.id = s.student_id
        JOIN users t ON t.id = a.teacher_id
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE s.status = 'graded' AND a.teacher_id = ?
        ORDER BY u.name, a.title
    ");
    $stmt->execute([$user['id']]);
}
$rows = $stmt->fetchAll();

// Отдаём файл
$filename = 'grades_' . date('Y-m-d_H-i') . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

// BOM для Excel (чтобы русский отображался)
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
fputcsv($out, ['Студент', 'Email', 'Группа', 'Предмет', 'Задание', 'Балл', 'Макс. балл', 'Процент', 'Дата проверки', 'Комментарий', 'Преподаватель'], ';');

foreach ($rows as $r) {
    $pct = $r['grade_max'] > 0 ? round($r['grade'] / $r['grade_max'] * 100, 1) : 0;
    fputcsv($out, [
        $r['student'],
        $r['student_email'],
        $r['group_name'] ?? '',
        $r['subject'] ?? '',
        $r['assignment'],
        $r['grade'],
        $r['grade_max'],
        $pct,
        $r['graded_at'],
        $r['teacher_comment'] ?? '',
        $r['teacher'],
    ], ';');
}
fclose($out);
exit;
