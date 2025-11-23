.PHONY: help dev prod build build-prod up up-prod down down-prod logs logs-prod clean

# Detect docker-compose command (docker compose V2 or docker-compose V1)
# Try docker compose first (V2), fallback to docker-compose (V1)
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev          - Start development environment"
	@echo "  make prod          - Start production environment"
	@echo "  make build         - Build development Docker image"
	@echo "  make build-prod    - Build production Docker image"
	@echo "  make up            - Start development containers"
	@echo "  make up-prod       - Start production containers"
	@echo "  make down          - Stop development containers"
	@echo "  make down-prod     - Stop production containers"
	@echo "  make logs          - Show development logs"
	@echo "  make logs-prod     - Show production logs"
	@echo "  make clean         - Remove containers, volumes, and images"
	@echo ""
	@echo "Using: $(COMPOSE)"

# Development commands
dev: up

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

# Production commands
prod: build-prod up-prod

build-prod:
	$(COMPOSE) -f docker-compose.prod.yaml build

up-prod:
	$(COMPOSE) -f docker-compose.prod.yaml up -d

down-prod:
	$(COMPOSE) -f docker-compose.prod.yaml down

logs-prod:
	$(COMPOSE) -f docker-compose.prod.yaml logs -f

# Cleanup
clean:
	$(COMPOSE) down -v
	$(COMPOSE) -f docker-compose.prod.yaml down -v
	docker system prune -f
