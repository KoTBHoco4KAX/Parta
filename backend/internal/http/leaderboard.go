package httpapi

import (
	"net/http"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	leaderboarddomain "github.com/parta/backend/internal/domain/leaderboard"
)

// leaderboardEntryView — строка рейтинга.
type leaderboardEntryView struct {
	UserID      int64   `json:"user_id"`
	DisplayName string  `json:"display_name"`
	WeeklyXP    int     `json:"weekly_xp"`
	Rank        int     `json:"rank"`
	GrowthXP    int     `json:"growth_xp,omitempty"`
	GrowthPct   float64 `json:"growth_percent,omitempty"`
	IsCurrent   bool    `json:"is_current,omitempty"`
}

// leaderboardMeView — позиция текущего ученика.
type leaderboardMeView struct {
	UserID       int64  `json:"user_id"`
	DisplayName  string `json:"display_name"`
	WeeklyXP     int    `json:"weekly_xp"`
	Rank         int    `json:"rank"`
	XPToNextRank int    `json:"xp_to_next_rank"`
	GroupCode    string `json:"group_code"`
}

// leaderboardResponse — ответ GET /api/leaderboard.
type leaderboardResponse struct {
	Group        string                 `json:"group"`
	GroupTitle   string                 `json:"group_title"`
	WeekStart    string                 `json:"week_start"`
	WeekEndsAt   string                 `json:"week_ends_at"`
	Me           leaderboardMeView      `json:"me"`
	Top          []leaderboardEntryView `json:"top"`
	Breakthrough []leaderboardEntryView `json:"breakthrough"`
}

// handleLeaderboard отдаёт недельный рейтинг учебной группы ученика.
func (s *Server) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	if user.GroupID == nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	now := s.now()
	weekStart := leaderboarddomain.WeekStart(now)
	weekEnd := leaderboarddomain.WeekEnd(now)

	data, err := s.leaderboard.ForGroup(r.Context(), *user.GroupID, weekStart, weekEnd)
	if err != nil {
		writeError(w, err)

		return
	}

	top := make([]leaderboardEntryView, 0, len(data.Top))
	me := leaderboardMeView{
		UserID:      user.ID,
		DisplayName: user.DisplayName,
		GroupCode:   data.GroupCode,
	}

	for i := range data.Top {
		entry := data.Top[i]
		view := leaderboardEntryView{
			UserID:      entry.UserID,
			DisplayName: entry.DisplayName,
			WeeklyXP:    entry.WeeklyXP,
			Rank:        entry.Rank,
			IsCurrent:   entry.UserID == user.ID,
		}

		if view.IsCurrent {
			me.WeeklyXP = entry.WeeklyXP
			me.Rank = entry.Rank
		}

		top = append(top, view)
	}

	// Сколько XP нужно, чтобы обогнать ближайшего соперника сверху.
	if me.Rank > 1 {
		target := 0
		found := false

		for i := range data.Top {
			entry := data.Top[i]
			if entry.Rank >= me.Rank {
				continue
			}

			if !found || entry.WeeklyXP < target {
				target = entry.WeeklyXP
				found = true
			}
		}

		if found && target >= me.WeeklyXP {
			me.XPToNextRank = target - me.WeeklyXP + 1
		}
	}

	breakthrough := make([]leaderboardEntryView, 0, len(data.Breakthrough))
	for i := range data.Breakthrough {
		entry := data.Breakthrough[i]
		breakthrough = append(breakthrough, leaderboardEntryView{
			UserID:      entry.UserID,
			DisplayName: entry.DisplayName,
			WeeklyXP:    entry.WeeklyXP,
			Rank:        entry.Rank,
			GrowthXP:    entry.GrowthXP,
			GrowthPct:   entry.GrowthPct,
			IsCurrent:   entry.UserID == user.ID,
		})
	}

	writeJSON(w, http.StatusOK, leaderboardResponse{
		Group:        data.GroupCode,
		GroupTitle:   data.GroupTitle,
		WeekStart:    eventTime(weekStart),
		WeekEndsAt:   eventTime(weekEnd),
		Me:           me,
		Top:          top,
		Breakthrough: breakthrough,
	})
}
