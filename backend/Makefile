BIN := bin/server

.PHONY: build run test migrate clean-db

build:
	go build -o $(BIN) ./cmd/server

run:
	go run ./cmd/server

test:
	go test ./...

migrate:
	PARTA_DB_PATH=./parta.db go run ./cmd/server

clean-db:
	rm -f parta.db parta.db-shm parta.db-wal
