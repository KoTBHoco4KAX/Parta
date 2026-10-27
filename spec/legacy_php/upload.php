<?php
require __DIR__ . '/config.php';

$user = require_login_api();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['error' => 'Method not allowed'], 405);

$ownerType = $_POST['owner_type'] ?? '';
$ownerId   = (int)($_POST['owner_id'] ?? 0);
if (!in_array($ownerType, ['assignment','submission'], true) || !$ownerId) {
    json_response(['error' => 'owner_type/owner_id required'], 422);
}

// Проверка прав — используем ту же функцию, что в api.php
require_once __DIR__ . '/api_helpers.php';
if (!canAccessOwner($user, $ownerType, $ownerId)) {
    json_response(['error' => 'Forbidden'], 403);
}

// Дополнительно: препод может грузить к assignment только свои
if ($ownerType === 'assignment') {
    $stmt = db()->prepare('SELECT teacher_id FROM assignments WHERE id = ?');
    $stmt->execute([$ownerId]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'Assignment not found'], 404);
    if ($user['role'] !== 'admin' && (int)$row['teacher_id'] !== (int)$user['id']) {
        json_response(['error' => 'Только преподаватель задания может грузить файлы'], 403);
    }
}

// Студент может грузить к submission только своё
if ($ownerType === 'submission') {
    $stmt = db()->prepare('SELECT student_id FROM submissions WHERE id = ?');
    $stmt->execute([$ownerId]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'Submission not found'], 404);
    if ($user['role'] === 'student' && (int)$row['student_id'] !== (int)$user['id']) {
        json_response(['error' => 'Не твоя работа'], 403);
    }
}

if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    json_response(['error' => 'Файл не загружен'], 422);
}

$f = $_FILES['file'];
if ($f['size'] > UPLOAD_MAX_SIZE) json_response(['error' => 'Файл больше 10 МБ'], 422);

$allowed = [
    'application/pdf' => 'pdf',
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp',
    'text/plain' => 'txt',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'application/zip' => 'zip',
];

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->file($f['tmp_name']) ?: 'application/octet-stream';
if (!isset($allowed[$mime])) json_response(['error' => 'Тип файла не разрешён: ' . $mime], 422);

$ext      = $allowed[$mime];
$safeName = bin2hex(random_bytes(16)) . '.' . $ext;
$subdir   = date('Y/m');
$dir      = UPLOAD_DIR . '/' . $subdir;

if (!is_dir($dir) && !mkdir($dir, 0775, true)) json_response(['error' => 'Не удалось создать папку'], 500);

$dest = $dir . '/' . $safeName;
if (!move_uploaded_file($f['tmp_name'], $dest)) json_response(['error' => 'Не удалось сохранить файл'], 500);

$storagePath = $subdir . '/' . $safeName;
$origName    = mb_substr(basename($f['name']), 0, 200);

$stmt = db()->prepare('
    INSERT INTO attachments (owner_type, owner_id, user_id, filename, mime, size_bytes, storage_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
');
$stmt->execute([$ownerType, $ownerId, $user['id'], $origName, $mime, $f['size'], $storagePath]);

$newId = (int)db()->lastInsertId();
json_response(['data' => ['id' => $newId, 'filename' => $origName, 'size' => $f['size'], 'human' => human_size($f['size']), 'url' => 'files.php?id=' . $newId]]);
