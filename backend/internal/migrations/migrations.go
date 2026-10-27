// Package migrations embeds the numbered DDL files of the ПАРТА schema.
package migrations

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
)

//go:embed *.sql
var files embed.FS

// Migration is one numbered DDL file with its parsed version.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// Files returns every embedded migration sorted by ascending version.
func Files() ([]Migration, error) {
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return nil, fmt.Errorf("migrations: read dir: %w", err)
	}

	out := make([]Migration, 0, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		contents, err := files.ReadFile(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("migrations: read %s: %w", entry.Name(), err)
		}

		version, err := parseVersion(entry.Name())
		if err != nil {
			return nil, err
		}

		out = append(out, Migration{
			Version: version,
			Name:    entry.Name(),
			SQL:     string(contents),
		})
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].Version < out[j].Version
	})

	for i := 1; i < len(out); i++ {
		if out[i].Version == out[i-1].Version {
			return nil, fmt.Errorf("migrations: duplicate version %d", out[i].Version)
		}
	}

	return out, nil
}

// parseVersion extracts N from an NNN_name.sql file name.
func parseVersion(name string) (int, error) {
	base := strings.TrimSuffix(name, ".sql")

	number, _, found := strings.Cut(base, "_")
	if !found {
		return 0, fmt.Errorf("migrations: %q is not named NNN_name.sql", name)
	}

	version, err := strconv.Atoi(number)
	if err != nil {
		return 0, fmt.Errorf("migrations: %q has a non-numeric version: %w", name, err)
	}

	return version, nil
}
