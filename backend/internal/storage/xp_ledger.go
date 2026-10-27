package storage

import (
	"context"
	"database/sql"
	"time"

	domainerrors "github.com/parta/backend/internal/domain/errors"
)

// Допустимые причины проводки (CHECK в xp_ledger.reason).
const (
	ReasonTaskBase         = "TASK_BASE"
	ReasonSpeedrunBonus    = "SPEEDRUN_BONUS"
	ReasonPeerReviewReward = "PEER_REVIEW_REWARD"
	ReasonWagerWin         = "WAGER_WIN"
	ReasonWagerLoss        = "WAGER_LOSS"
	ReasonWagerPlace       = "WAGER_PLACE"
	ReasonFreezePurchase   = "FREEZE_PURCHASE"
	ReasonCarryOverBonus   = "CARRY_OVER_BONUS"
	ReasonPenalty          = "PENALTY"
	ReasonAdminAdjustment  = "ADMIN_ADJUSTMENT"
)

// Допустимые источники проводки (CHECK в xp_ledger.source_type).
const (
	SourceTask       = "TASK"
	SourceSubmission = "SUBMISSION"
	SourceWager      = "WAGER"
	SourcePeerReview = "PEER_REVIEW"
	SourceUser       = "USER"
	SourceSystem     = "SYSTEM"
	SourceTeamSlot   = "TEAM_SLOT"
)

// LedgerEntry — одна проводка журнала XP.
type LedgerEntry struct {
	ID             int64
	UserID         int64
	Amount         int
	BalanceAfter   int
	Reason         string
	SourceType     string
	SourceID       *int64
	IdempotencyKey string
	CreatedAt      time.Time
}

// PostLedgerInput — параметры проводки.
type PostLedgerInput struct {
	UserID         int64
	Amount         int
	Reason         string
	SourceType     string
	SourceID       *int64
	IdempotencyKey string
}

// XPLedgerRepo — доступ к журналу XP и балансу пользователя.
type XPLedgerRepo struct {
	users *UserRepo
}

// NewXPLedgerRepo создаёт репозиторий журнала XP.
func NewXPLedgerRepo(db *sql.DB) *XPLedgerRepo {
	return &XPLedgerRepo{users: NewUserRepo(db)}
}

const ledgerColumns = `id, user_id, amount, balance_after, reason, source_type,
	source_id, idempotency_key, created_at`

// Post выполняет проводку и обновляет баланс в переданной транзакции.
// Повторный вызов с тем же idempotency_key возвращает уже созданную проводку.
func (r *XPLedgerRepo) Post(ctx context.Context, tx *sql.Tx, in PostLedgerInput) (*LedgerEntry, error) {
	existing, err := r.GetByIdempotencyKey(ctx, tx, in.IdempotencyKey)
	if err != nil && !domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
		return nil, err
	}

	if existing != nil {
		return existing, nil
	}

	if in.Amount == 0 {
		return nil, domainerrors.ErrInvalidArgument
	}

	newBalance, err := r.users.UpdateXPBalance(ctx, tx, in.UserID, in.Amount)
	if err != nil {
		if domainerrors.IsSentinel(err, domainerrors.ErrNotFound) {
			return nil, domainerrors.ErrInsufficientXP
		}

		return nil, err
	}

	row := tx.QueryRowContext(ctx,
		`INSERT INTO xp_ledger (user_id, amount, balance_after, reason, source_type,
		                        source_id, idempotency_key)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 RETURNING `+ledgerColumns,
		in.UserID, in.Amount, newBalance, in.Reason, in.SourceType, in.SourceID, in.IdempotencyKey)

	entry, err := scanLedgerEntry(row)
	if err != nil {
		// Гонка: параллельный вызов вставил ту же проводку между проверкой и INSERT.
		if domainerrors.IsSentinel(MapSQLError(err), domainerrors.ErrAlreadyExists) {
			return r.GetByIdempotencyKey(ctx, tx, in.IdempotencyKey)
		}

		return nil, MapSQLError(err)
	}

	return entry, nil
}

// GetByIdempotencyKey возвращает проводку по ключу идемпотентности.
func (r *XPLedgerRepo) GetByIdempotencyKey(ctx context.Context, tx *sql.Tx, key string) (*LedgerEntry, error) {
	row := tx.QueryRowContext(ctx,
		`SELECT `+ledgerColumns+` FROM xp_ledger WHERE idempotency_key = ?`, key)

	entry, err := scanLedgerEntry(row)

	return entry, MapSQLError(err)
}

// ListByUser возвращает проводки пользователя от новых к старым.
func (r *XPLedgerRepo) ListByUser(ctx context.Context, tx *sql.Tx, userID int64) ([]LedgerEntry, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT `+ledgerColumns+`
		 FROM xp_ledger
		 WHERE user_id = ?
		 ORDER BY id DESC`, userID)
	if err != nil {
		return nil, MapSQLError(err)
	}
	defer rows.Close()

	entries := make([]LedgerEntry, 0)

	for rows.Next() {
		entry, err := scanLedgerEntry(rows)
		if err != nil {
			return nil, MapSQLError(err)
		}

		entries = append(entries, *entry)
	}

	return entries, MapSQLError(rows.Err())
}

// scanLedgerEntry читает строку xp_ledger из row или rows.
func scanLedgerEntry(from row) (*LedgerEntry, error) {
	var (
		entry     LedgerEntry
		sourceID  sql.NullInt64
		createdAt string
	)

	if err := from.Scan(
		&entry.ID,
		&entry.UserID,
		&entry.Amount,
		&entry.BalanceAfter,
		&entry.Reason,
		&entry.SourceType,
		&sourceID,
		&entry.IdempotencyKey,
		&createdAt,
	); err != nil {
		return nil, err
	}

	entry.SourceID = scanInt64Ptr(sourceID)

	parsed, err := parseTime(createdAt)
	if err != nil {
		return nil, err
	}

	entry.CreatedAt = parsed

	return &entry, nil
}
