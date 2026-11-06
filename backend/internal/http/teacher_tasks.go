package httpapi

import (
	"context"
	"strconv"
	"strings"

	domainerrors "github.com/parta/backend/internal/domain/errors"
	"github.com/parta/backend/internal/storage"
)

// resolveStudents возвращает получателей задания.
//
// Пустой student_ids означает всю группу назначения. Если список задан,
// каждый id должен принадлежать этой группе и роли student: чужой ученик —
// invalid_argument (422), а не частичная выдача.
func (s *Server) resolveStudents(
	ctx context.Context,
	groupID int64,
	requested []int64,
) ([]storage.User, error) {
	members, err := s.users.ListByGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}

	students := make([]storage.User, 0, len(members))
	byID := make(map[int64]storage.User, len(members))

	for i := range members {
		if members[i].Role != RoleStudent {
			continue
		}

		students = append(students, members[i])
		byID[members[i].ID] = members[i]
	}

	if len(requested) == 0 {
		return students, nil
	}

	selected := make([]storage.User, 0, len(requested))
	seen := make(map[int64]struct{}, len(requested))

	for _, studentID := range requested {
		if studentID <= 0 {
			return nil, domainerrors.ErrInvalidArgument
		}

		if _, duplicate := seen[studentID]; duplicate {
			continue
		}

		student, found := byID[studentID]
		if !found {
			return nil, domainerrors.ErrInvalidArgument
		}

		seen[studentID] = struct{}{}
		selected = append(selected, student)
	}

	if len(selected) == 0 {
		return nil, domainerrors.ErrInvalidArgument
	}

	return selected, nil
}

// parseStudentIDs разбирает multipart-поле student_ids. Поле может повторяться
// (form.append для каждого ученика) или содержать CSV-список.
func parseStudentIDs(values []string) ([]int64, error) {
	ids := make([]int64, 0, len(values))

	for _, raw := range values {
		for _, part := range strings.Split(raw, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}

			value, err := strconv.ParseInt(part, 10, 64)
			if err != nil || value <= 0 {
				return nil, domainerrors.ErrInvalidArgument
			}

			ids = append(ids, value)
		}
	}

	return ids, nil
}
