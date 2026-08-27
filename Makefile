SHELL := /usr/bin/env bash

.PHONY: local-up local-clean local-down db-up db-down

local-up:
	@DOCKER="$(DOCKER)" SKIP="$(SKIP)" ./scripts/local/up.sh

local-clean:
	@DOCKER="$(DOCKER)" ./scripts/local/clean.sh

local-down:
	@DOCKER="$(DOCKER)" ./scripts/local/down.sh

db-up:
	@DOCKER=1 DB_ONLY=1 ./scripts/local/up.sh

db-down:
	@DOCKER=1 DB_ONLY=1 ./scripts/local/down.sh
