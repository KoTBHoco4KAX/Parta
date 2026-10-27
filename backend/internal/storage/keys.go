package storage

import "strconv"

// itoa печатает целое для сборки детерминированных ключей идемпотентности.
func itoa(value int64) string {
	return strconv.FormatInt(value, 10)
}

// freezePurchaseKey — ключ идемпотентности покупки заморозок.
func freezePurchaseKey(userID int64) string {
	return "freeze:" + itoa(userID)
}

// peerEscrowKey — ключ идемпотентности удержания escrow под peer-review.
func peerEscrowKey(reviewID int64) string {
	return "peer_review:" + itoa(reviewID) + ":escrow"
}

// peerRewardKey — ключ идемпотентности выплаты за peer-review.
func peerRewardKey(reviewID int64) string {
	return "peer_review:" + itoa(reviewID) + ":reward"
}

// peerRefundKey — ключ идемпотентности возврата escrow автору.
func peerRefundKey(reviewID int64) string {
	return "peer_review:" + itoa(reviewID) + ":refund"
}
