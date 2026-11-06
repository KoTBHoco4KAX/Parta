package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// newWebHandler отдаёт собранный frontend из root, а неизвестные пути
// отправляет в index.html. Если root пуст (dev), работает только API.
func newWebHandler(api http.Handler, root string) http.Handler {
	if strings.TrimSpace(root) == "" {
		return api
	}

	files := http.FileServer(http.Dir(root))
	index := filepath.Join(root, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			api.ServeHTTP(w, r)

			return
		}

		relative := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
		path := filepath.Join(root, relative)

		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			files.ServeHTTP(w, r)

			return
		}

		http.ServeFile(w, r, index)
	})
}
