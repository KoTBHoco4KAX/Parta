package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// LeaderboardEntry — строка рейтинга ученика.
type LeaderboardEntry struct {
	UserID      int64
	DisplayName string
	WeeklyXP    int
	Rank        int
	GrowthXP    int
	GrowthPct   float64
	PreviousXP  int
}

// LeaderboardData — рейтинг группы на текущую неделю.
type LeaderboardData struct {
	GroupID      int64
	GroupCode    string
	GroupTitle   string
	WeekStart    time.Time
	WeekEnd      time.Time
	Top          []LeaderboardEntry
	Breakthrough []LeaderboardEntry
}

// LeaderboardRepo — SQL-выборки рейтинга.
type LeaderboardRepo struct {
	db *sql.DB
}

// NewLeaderboardRepo создаёт репозиторий лидерборда.
func NewLeaderboardRepo(db *sql.DB) *LeaderboardRepo {
	return &LeaderboardRepo{db: db}
}

// ForGroup собирает рейтинг группы по weekly_xp с учётом недели.
//
// weekly_xp_week хранит понедельник недели. Если неделя устарела, при чтении
// XP считается нулевым — без фонового сброса и без потери баланса xp_balance.
func (r *LeaderboardRepo) ForGroup(
	ctx context.Context,
	groupID int64,
	weekStart, weekEnd time.Time,
) (*LeaderboardData, error) {
	var data LeaderboardData

	data.GroupID = groupID
	data.WeekStart = weekStart
	data.WeekEnd = weekEnd

	err := r.db.QueryRowContext(ctx,
		`SELECT code, title FROM groups WHERE id = ?`, groupID).
		Scan(&data.GroupCode, &data.GroupTitle)
	if err != nil {
		return nil, MapSQLError(err)
	}

	weekKey := weekStart.Format("2006-01-02")

	rows, err := r.db.QueryContext(ctx,
		`WITH effective AS (
		    SELECT u.id,
		           u.display_name,
		           CASE WHEN u.weekly_xp_week = ? THEN u.weekly_xp ELSE 0 END AS weekly_xp
		    FROM users u
		    WHERE u.role = 'student' AND u.group_id = ?
		 ),
		 ranked AS (
		    SELECT id, display_name, weekly_xp,
		           DENSE_RANK() OVER (ORDER BY weekly_xp DESC) AS rank
		    FROM effective
		 )
		 SELECT id, display_name, weekly_xp, rank
		 FROM ranked
		 ORDER BY rank, display_name COLLATE NOCASE`,
		weekKey, groupID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	data.Top = make([]LeaderboardEntry, 0)

	for rows.Next() {
		var entry LeaderboardEntry

		if err := rows.Scan(&entry.UserID, &entry.DisplayName, &entry.WeeklyXP, &entry.Rank); err != nil {
			return nil, MapSQLError(err)
		}

		data.Top = append(data.Top, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, MapSQLError(err)
	}

	data.Breakthrough, err = r.breakthrough(ctx, groupID, weekKey, weekStart, weekEnd)
	if err != nil {
		return nil, err
	}

	return &data, nil
}

// breakthrough считает прирост текущей недели к предыдущей по xp_ledger.
func (r *LeaderboardRepo) breakthrough(
	ctx context.Context,
	groupID int64,
	weekKey string,
	weekStart, weekEnd time.Time,
) ([]LeaderboardEntry, error) {
	currentStart := FormatTimestamp(weekStart)
	currentEnd := FormatTimestamp(weekEnd.Add(time.Second))
	previousStart := FormatTimestamp(weekStart.AddDate(0, 0, -7))
	previousEnd := currentStart

	rows, err := r.db.QueryContext(ctx,
		`WITH members AS (
		    SELECT u.id, u.display_name,
		           CASE WHEN u.weekly_xp_week = ? THEN u.weekly_xp ELSE 0 END AS weekly_xp
		    FROM users u
		    WHERE u.role = 'student' AND u.group_id = ?
		 ),
		 earned AS (
		    SELECT l.user_id,
		           SUM(CASE WHEN l.amount > 0 AND l.created_at >= ? AND l.created_at < ?
		                    THEN l.amount ELSE 0 END) AS current_xp,
		           SUM(CASE WHEN l.amount > 0 AND l.created_at >= ? AND l.created_at < ?
		                    THEN l.amount ELSE 0 END) AS previous_xp
		    FROM xp_ledger l
		    JOIN members m ON m.id = l.user_id
		    WHERE l.amount > 0
		    GROUP BY l.user_id
		 ),
		 growth AS (
		    SELECT m.id, m.display_name, m.weekly_xp,
		           COALESCE(e.current_xp, 0) AS current_xp,
		           COALESCE(e.previous_xp, 0) AS previous_xp,
		           CASE
		               WHEN COALESCE(e.previous_xp, 0) > 0
		                   THEN ROUND(
		                       (COALESCE(e.current_xp, 0) - COALESCE(e.previous_xp, 0)) * 100.0
		                       / COALESCE(e.previous_xp, 0), 1)
		               WHEN COALESCE(e.current_xp, 0) > 0 THEN 100.0
		               ELSE 0.0
		           END AS growth_percent
		    FROM members m
		    LEFT JOIN earned e ON e.user_id = m.id
		 )
		 SELECT id, display_name, weekly_xp, previous_xp, growth_percent
		 FROM growth
		 WHERE current_xp > 0
		 ORDER BY growth_percent DESC, current_xp DESC, display_name COLLATE NOCASE`,
		weekKey, groupID, currentStart, currentEnd, previousStart, previousEnd)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	entries := make([]LeaderboardEntry, 0)

	for rows.Next() {
		var entry LeaderboardEntry

		if err := rows.Scan(&entry.UserID, &entry.DisplayName, &entry.WeeklyXP,
			&entry.PreviousXP, &entry.GrowthPct); err != nil {
			return nil, MapSQLError(err)
		}

		entry.Rank = len(entries) + 1
		entry.GrowthXP = entry.WeeklyXP - entry.PreviousXP
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, MapSQLError(err)
	}

	return entries, nil
}

// IsNotFound сообщает, что группа не найдена.
func IsLeaderboardNotFound(err error) bool {
	return domainerrors.IsSentinel(err, domainerrors.ErrNotFound)
}
