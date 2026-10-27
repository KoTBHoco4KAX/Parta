package config

import (
	"fmt"
	"os"
	"time"
)

// Config holds every environment-derived setting of the ПАРТА backend.
type Config struct {
	JWTSecret string
	Env       string
	DBPath    string
	Addr      string
}

const (
	defaultJWTSecret = "dev-secret-change-me"
	defaultEnv       = "dev"
	defaultDBPath    = "./parta.db"
	defaultAddr      = ":8080"
)

// JWTIssuer is the iss claim of every issued token (spec/04_API.md auth rules).
const JWTIssuer = "parta"

// JWTTTL is the lifetime of an issued token.
const JWTTTL = 24 * time.Hour

// IsDev reports whether the process runs in the dev environment.
func (c Config) IsDev() bool {
	return c.Env == "dev"
}

// Load reads PARTA_JWT_SECRET, PARTA_ENV and PARTA_DB_PATH.
func Load() (Config, error) {
	cfg := Config{
		JWTSecret: envOr("PARTA_JWT_SECRET", defaultJWTSecret),
		Env:       envOr("PARTA_ENV", defaultEnv),
		DBPath:    envOr("PARTA_DB_PATH", defaultDBPath),
		Addr:      envOr("PARTA_ADDR", defaultAddr),
	}

	if cfg.DBPath == "" {
		return Config{}, fmt.Errorf("config: PARTA_DB_PATH must not be empty")
	}

	return cfg, nil
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
