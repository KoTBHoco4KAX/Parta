package httpapi

import (
	"database/sql"
	"fmt"
	"net/http"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/domain/economy"
	"github.com/parta/backend/internal/storage"
)

// maxFreezeQuantity — верхняя граница покупки за один запрос.
const maxFreezeQuantity = 10

// purchaseFreezesRequest — тело покупки заморозок.
type purchaseFreezesRequest struct {
	Quantity int `json:"quantity"`
}

// purchaseFreezesResponse — ответ покупки заморозок.
type purchaseFreezesResponse struct {
	StreakFreezes int   `json:"streak_freezes"`
	XPBalance     int   `json:"xp_balance"`
	LedgerID      int64 `json:"ledger_id"`
}

// handlePurchaseFreezes покупает заморозки стрика по 200 XP за штуку.
func (s *Server) handlePurchaseFreezes(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principalOr401(w, r)
	if !ok {
		return
	}

	if !requireRole(w, p, RoleStudent) {
		return
	}

	var req purchaseFreezesRequest

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Quantity == 0 {
		req.Quantity = 1
	}

	if req.Quantity < 0 || req.Quantity > maxFreezeQuantity {
		writeError(w, domainerrors.ErrInvalidArgument)

		return
	}

	user, err := s.users.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeError(w, err)

		return
	}

	price := economy.StreakFreezePriceXP * req.Quantity
	if user.XPBalance < price {
		writeError(w, domainerrors.ErrInsufficientXP)

		return
	}

	var (
		ledgerID int64
		balance  int
		freezes  int
	)

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		entry, err := s.ledger.Post(r.Context(), tx, storage.PostLedgerInput{
			UserID:         user.ID,
			Amount:         -price,
			Reason:         storage.ReasonFreezePurchase,
			SourceType:     storage.SourceUser,
			SourceID:       &user.ID,
			IdempotencyKey: fmt.Sprintf("freeze:%d:%d", user.ID, s.now().UnixNano()),
		})
		if err != nil {
			return err
		}

		ledgerID = entry.ID
		balance = entry.BalanceAfter

		freezes, err = s.users.AddFreezes(r.Context(), tx, user.ID, req.Quantity)

		return err
	})
	if err != nil {
		writeError(w, err)

		return
	}

	writeJSON(w, http.StatusOK, purchaseFreezesResponse{
		StreakFreezes: freezes,
		XPBalance:     balance,
		LedgerID:      ledgerID,
	})
}
