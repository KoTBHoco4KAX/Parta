package config

import (
	"fmt"
	"os"
	"time"
)

// Config holds every environment-derived setting of the ПАРТА backend.
type Config struct {
	JWTSecret         string
	Env               string
	DBPath            string
	Addr              string
	UploadDir         string
	WebDir            string
	MAXBotToken       string
	MAXAPIBaseURL     string
	MAXAppURL         string
	TeacherInviteCode string
	AdminInviteCode   string
}

const (
	defaultJWTSecret = "dev-secret-change-me"
	defaultEnv       = "dev"
	defaultDBPath    = "./parta.db"
	defaultAddr      = ":8080"
	// Файлы лежат вне Go-модуля: иначе загруженный .go-файл ломает go build ./...
	defaultUploadDir = "../uploads"
)

// JWTIssuer is the iss claim of every issued token (spec/04_API.md auth rules).
const JWTIssuer = "parta"

// JWTTTL is the lifetime of an issued token.
const JWTTTL = 24 * time.Hour

// IsDev reports whether the process runs in the dev environment.
func (c Config) IsDev() bool {
	return c.Env == "dev"
}

// Load reads PARTA_JWT_SECRET, PARTA_ENV, PARTA_DB_PATH, PARTA_ADDR and
// PARTA_UPLOAD_DIR.
func Load() (Config, error) {
	cfg := Config{
		JWTSecret:         envOr("PARTA_JWT_SECRET", defaultJWTSecret),
		Env:               envOr("PARTA_ENV", defaultEnv),
		DBPath:            envOr("PARTA_DB_PATH", defaultDBPath),
		Addr:              envOr("PARTA_ADDR", ":"+envOr("PORT", "8080")),
		UploadDir:         envOr("PARTA_UPLOAD_DIR", defaultUploadDir),
		WebDir:            envOr("PARTA_WEB_DIR", ""),
		MAXBotToken:       envOr("MAX_BOT_TOKEN", ""),
		MAXAPIBaseURL:     envOr("MAX_API_BASE_URL", "https://platform-api2.max.ru"),
		MAXAppURL:         envOr("MAX_APP_URL", "https://slow-cat.vps.ktk-45.ru/"),
		TeacherInviteCode: envOr("TEACHER_INVITE_CODE", "TEACHER2026"),
		AdminInviteCode:   envOr("ADMIN_INVITE_CODE", "ADMIN2026"),
	}

	if cfg.DBPath == "" {
		return Config{}, fmt.Errorf("config: PARTA_DB_PATH must not be empty")
	}

	if cfg.UploadDir == "" {
		return Config{}, fmt.Errorf("config: PARTA_UPLOAD_DIR must not be empty")
	}

	return cfg, nil
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
