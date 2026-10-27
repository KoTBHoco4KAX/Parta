<?php
// =====================================================================
//  Настройки приложения и подключение к MySQL.
// =====================================================================

declare(strict_types=1);

session_start();

const DB_HOST = '127.0.0.1';
const DB_NAME = 'kanban';
const DB_USER = 'kanban';
const DB_PASS = 'kanban123';

// Куда складываем загруженные файлы
const UPLOAD_DIR = __DIR__ . '/uploads';
const UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10 МБ

// ---- Подключение к БД ----
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ---- JSON-ответ ----
function json_response(mixed $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---- Экранирование ----
function e(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

// ---- Текущий юзер ----
function current_user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    static $user = null;
    if ($user === null) {
        $stmt = db()->prepare('SELECT id, email, name, role, group_name, theme, blocked FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch() ?: null;
        if ($user && (int)$user['blocked'] === 1) {
            session_destroy();
            $user = null;
        }
    }
    return $user;
}

// ---- Требуется вход (страница) ----
function require_login(): array {
    $u = current_user();
    if (!$u) { header('Location: login.php'); exit; }
    return $u;
}

// ---- Требуется вход (API) ----
function require_login_api(): array {
    $u = current_user();
    if (!$u) json_response(['error' => 'Unauthorized'], 401);
    return $u;
}

// ---- Требуется роль ----
function require_role(string ...$roles): array {
    $u = require_login_api();
    if (!in_array($u['role'], $roles, true)) {
        json_response(['error' => 'Forbidden'], 403);
    }
    return $u;
}

// ---- Проверка роли без исключения ----
function has_role(array $user, string ...$roles): bool {
    return in_array($user['role'], $roles, true);
}

// ---- Лейбл роли (ЭТА ФУНКЦИЯ ПРОПАЛА) ----
function role_label(string $role): string {
    return match ($role) {
        'student' => 'Студент',
        'teacher' => 'Преподаватель',
        'admin'   => 'Админ',
        default   => $role,
    };
}

// ---- Размер файла по-человечески ----
function human_size(int $bytes): string {
    if ($bytes < 1024) return $bytes . ' Б';
    if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' КБ';
    return round($bytes / 1024 / 1024, 1) . ' МБ';
}

// =====================================================================
//  Impersonate — админ может "зайти как" другой пользователь
// =====================================================================

function is_impersonating(): bool {
    return !empty($_SESSION['admin_id']) && (int)$_SESSION['admin_id'] !== (int)($_SESSION['user_id'] ?? 0);
}

function impersonate(int $userId): void {
    // Если мы уже impersonate — сохраняем оригинального админа
    if (!isset($_SESSION['admin_id'])) {
        $_SESSION['admin_id'] = $_SESSION['user_id'] ?? null;
    }
    $_SESSION['user_id'] = $userId;
}

function impersonate_stop(): void {
    if (!empty($_SESSION['admin_id'])) {
        $_SESSION['user_id'] = $_SESSION['admin_id'];
        unset($_SESSION['admin_id']);
    }
}

// HTML-плашка сверху, если админ "зашёл как"
function impersonate_banner(): string {
    if (!is_impersonating()) return '';
    $realId = (int)$_SESSION['admin_id'];
    $stmt = db()->prepare('SELECT name FROM users WHERE id = ?');
    $stmt->execute([$realId]);
    $admin = $stmt->fetch();
    $adminName = $admin['name'] ?? 'Админ';
    return '<div style="background:#ef4444;color:white;text-align:center;padding:6px 12px;font-size:13px;font-family:system-ui,sans-serif;">'
         . '👑 Режим просмотра от лица пользователя. Вы вошли как админ: <b>' . e($adminName) . '</b>. '
         . '<a href="impersonate.php?action=stop" style="color:white;text-decoration:underline;font-weight:600;">← Вернуться под админом</a>'
         . '</div>';
}
