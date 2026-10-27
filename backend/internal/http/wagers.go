package httpapi

import (
	"database/sql"
	"net/http"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/wager"
	"github.com/parta/backend/internal/storage"
)

// createWagerRequest — тело POST /api/wagers.
type createWagerRequest struct {
	TaskID      int64  `json:"task_id"`
	StakeAmount int    `json:"stake_amount"`
	DeadlineAt  string `json:"deadline_at"`
}

// createWagerResponse — ответ создания пари.
type createWagerResponse struct {
	WagerID     int64  `json:"wager_id"`
	Status      string `json:"status"`
	EscrowTxID  int64  `json:"escrow_tx_id"`
	StakeAmount int    `json:"stake_amount"`
}

// handleCreateWager создаёт пари студента на собственный результат.
func (s *Server) handleCreateWager(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	var req createWagerRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.TaskID <= 0 || req.StakeAmount <= 0 || req.DeadlineAt == "" {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	deadline, err := time.Parse(time.RFC3339, req.DeadlineAt)
	if err != nil {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	task, err := s.tasks.GetByID(r.Context(), req.TaskID)
	if err != nil {
		writeError(w, err)

		return
	}

	if err := s.ensureTaskAvailable(user, task); err != nil {
		writeError(w, err)

		return
	}

	if err := wager.ValidateCreate(req.StakeAmount, user.XPBalance, deadline, task.DeadlineAt, s.now()); err != nil {
		writeError(w, err)

		return
	}

	var created *storage.Wager

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		var err error

		created, err = s.wagers.Create(r.Context(), tx, storage.CreateWagerInput{
			StudentID:   user.ID,
			TaskID:      task.ID,
			StakeAmount: req.StakeAmount,
			DeadlineAt:  deadline,
		})

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusCreated, createWagerResponse{
		WagerID:     created.ID,
		Status:      created.Status,
		EscrowTxID:  created.EscrowLedgerID,
		StakeAmount: created.StakeAmount,
	})
}
