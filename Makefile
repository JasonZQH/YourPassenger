SHELL := /usr/bin/env bash

.PHONY: local-up local-clean local-down

local-up:
	@DOCKER="$(DOCKER)" ./scripts/local/up.sh

local-clean:
	@DOCKER="$(DOCKER)" ./scripts/local/clean.sh

local-down:
	@DOCKER="$(DOCKER)" ./scripts/local/down.sh
