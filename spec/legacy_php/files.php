<?php
require __DIR__ . '/config.php';
require_once __DIR__ . '/api_helpers.php';

$user = current_user();
if (!$user) { http_response_code(403); exit('Forbidden'); }

$id = (int)($_GET['id'] ?? 0);
if (!$id) { http_response_code(404); exit('Not found'); }

$stmt = db()->prepare('SELECT * FROM attachments WHERE id = ?');
$stmt->execute([$id]);
$a = $stmt->fetch();
if (!$a) { http_response_code(404); exit('Not found'); }

// Прямая проверка прав через canAccessOwner
if (!canAccessOwner($user, $a['owner_type'], (int)$a['owner_id'])) {
    http_response_code(403); exit('Forbidden');
}

$path = UPLOAD_DIR . '/' . $a['storage_path'];
if (!is_file($path)) { http_response_code(404); exit('File missing'); }

header('Content-Type: ' . $a['mime']);
header('Content-Length: ' . filesize($path));
header('Content-Disposition: inline; filename="' . rawurlencode($a['filename']) . '"');
readfile($path);
