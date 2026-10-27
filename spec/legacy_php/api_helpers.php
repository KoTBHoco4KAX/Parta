<?php
// Общие хелперы для api.php и upload.php

function canAccessOwner(array $user, string $ownerType, int $ownerId): bool {
    if ($ownerType === 'assignment') {
        $stmt = db()->prepare('SELECT teacher_id FROM assignments WHERE id = ?');
        $stmt->execute([$ownerId]);
        $row = $stmt->fetch();
        if (!$row) return false;
        if ($user['role'] === 'admin') return true;
        if ((int)$row['teacher_id'] === (int)$user['id']) return true;
        $stmt = db()->prepare('SELECT 1 FROM submissions WHERE assignment_id = ? AND student_id = ?');
        $stmt->execute([$ownerId, $user['id']]);
        return (bool)$stmt->fetch();
    }
    // submission
    $stmt = db()->prepare('
        SELECT s.student_id, a.teacher_id
        FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE s.id = ?
    ');
    $stmt->execute([$ownerId]);
    $row = $stmt->fetch();
    if (!$row) return false;
    if ($user['role'] === 'admin') return true;
    return (int)$row['student_id'] === (int)$user['id'] || (int)$row['teacher_id'] === (int)$user['id'];
}
