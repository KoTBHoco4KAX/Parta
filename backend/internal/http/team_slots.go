package httpapi

import (
	"database/sql"
	"net/http"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/teamslot"
	"github.com/parta/backend/internal/events"
	"github.com/parta/backend/internal/storage"
)

// carryOverResponse — ответ перехвата слота.
type carryOverResponse struct {
	TeamSlotID     int64  `json:"team_slot_id"`
	AssignedUserID int64  `json:"assigned_user_id"`
	Status         string `json:"status"`
	BonusXP        int    `json:"bonus_xp"`
}

// handleCarryOver перехватывает слот командного проекта студентом той же группы.
func (s *Server) handleCarryOver(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	slotID, err := parsePathID(r, "id")
	if err != nil {
		writeError(w, err)

		return
	}

	slot, err := s.teamSlots.GetByID(r.Context(), slotID)
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), slot.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	if user.GroupID == nil {
		writeError(w, domainerrors.ErrForbidden)

		return
	}

	if err := teamslot.CanCarryOver(teamslot.Status(slot.Status), *user.GroupID, task.GroupID); err != nil {
		writeError(w, err)

		return
	}

	var updated *storage.TeamSlot

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		updated, _, err = s.teamSlots.CarryOver(r.Context(), tx, slot.ID, user.ID)

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	assigned := int64(0)
	if updated.AssignedUserID != nil {
		assigned = *updated.AssignedUserID
	}

	s.publishCardEvent(r.Context(), events.New(
		events.TypeTeamSlotStateChanged,
		user.ID,
		events.RoomGroup(*user.GroupID),
		teamSlotStateChangedPayload{
			TeamSlotID:     updated.ID,
			TaskID:         updated.TaskID,
			Status:         updated.Status,
			AssignedUserID: assigned,
		},
	), updated.TaskID)

	writeJSON(w, http.StatusOK, carryOverResponse{
		TeamSlotID:     updated.ID,
		AssignedUserID: assigned,
		Status:         updated.Status,
		BonusXP:        task.BaseXP,
	})
}
