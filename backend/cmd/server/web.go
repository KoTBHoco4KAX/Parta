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

	serveIndex := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.ServeFile(w, r, index)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			api.ServeHTTP(w, r)

			return
		}

		relative := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
		path := filepath.Join(root, relative)

		if filepath.ToSlash(relative) == "index.html" {
			serveIndex(w, r)

			return
		}

		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			if strings.HasPrefix(filepath.ToSlash(relative), "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}

			files.ServeHTTP(w, r)

			return
		}

		serveIndex(w, r)
	})
}
