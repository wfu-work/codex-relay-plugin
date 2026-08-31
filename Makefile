SHELL := /bin/sh

PROJECT_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
REMOTE ?= origin
INIT_BRANCH ?= main
MESSAGE ?= build: publish Codex Relay plugin

.PHONY: help deps dev check test build validate preview clean git-init ensure-standalone bump-version push publish

help:
	@echo "Codex Relay Plugin"
	@echo ""
	@echo "  make dev                         启动 Vue 构建监听与本地配置台"
	@echo "  make check                       执行语法检查与测试"
	@echo "  make build                       构建 Vue UI 并生成可发布插件"
	@echo "  make preview                     运行生产构建的配置台"
	@echo "  make clean                       清理生产构建目录"
	@echo "  make git-init REPO_URL=<url>     初始化独立 Git 仓库并配置远程"
	@echo "  make push [BRANCH=main]          构建、提交并推送到远程仓库"
	@echo "  make publish [BRANCH=main]       更新时间戳版本、构建、提交并推送"

deps:
	npm install --no-audit --no-fund

dev: deps
	CODEX_RELAY_CONFIG_DIR="$(PROJECT_ROOT)/.codex-relay-data" npm run dev

check: deps
	npm run check

test: check

build: check
	npm run build
	npm run validate:build
	npm run smoke:build

validate:
	npm run validate:build

preview: build
	CODEX_RELAY_CONFIG_DIR="$(PROJECT_ROOT)/.codex-relay-data" node plugins/codex-relay-plugin/server/dashboard-cli.js

clean:
	npm run clean

git-init:
	@test -n "$(REPO_URL)" || { echo "缺少 REPO_URL，例如：make git-init REPO_URL=git@github.com:OWNER/codex-relay-plugin.git"; exit 1; }
	@if [ ! -e "$(PROJECT_ROOT)/.git" ]; then \
		git init -b "$(INIT_BRANCH)" "$(PROJECT_ROOT)"; \
	else \
		echo "已存在独立 Git 仓库：$(PROJECT_ROOT)"; \
	fi
	@if git -C "$(PROJECT_ROOT)" remote get-url "$(REMOTE)" >/dev/null 2>&1; then \
		current_url=$$(git -C "$(PROJECT_ROOT)" remote get-url "$(REMOTE)"); \
		[ "$$current_url" = "$(REPO_URL)" ] || { echo "远程 $(REMOTE) 已指向 $$current_url，未覆盖。"; exit 1; }; \
	else \
		git -C "$(PROJECT_ROOT)" remote add "$(REMOTE)" "$(REPO_URL)"; \
	fi
	@echo "Git 已就绪。下一步：make push"

ensure-standalone:
	@repo_root=$$(git -C "$(PROJECT_ROOT)" rev-parse --show-toplevel 2>/dev/null || true); \
	if [ "$$repo_root" != "$(PROJECT_ROOT)" ]; then \
		echo "拒绝推送：$(PROJECT_ROOT) 当前不是独立 Git 仓库（检测到：$${repo_root:-无}）。"; \
		echo "请先执行：make git-init REPO_URL=git@github.com:OWNER/codex-relay-plugin.git"; \
		exit 1; \
	fi; \
	git -C "$(PROJECT_ROOT)" remote get-url "$(REMOTE)" >/dev/null 2>&1 || { echo "未配置远程 $(REMOTE)。请先执行 make git-init REPO_URL=<url>"; exit 1; }

bump-version:
	@VERSION_TIMESTAMP="$(VERSION_TIMESTAMP)" node "$(PROJECT_ROOT)/scripts/update-version.mjs"

push: ensure-standalone build
	git -C "$(PROJECT_ROOT)" add -A
	@if git -C "$(PROJECT_ROOT)" diff --cached --quiet; then \
		echo "没有需要提交的变更。"; \
	else \
		git -C "$(PROJECT_ROOT)" commit -m "$(MESSAGE)"; \
	fi
	@branch="$(BRANCH)"; \
	if [ -z "$$branch" ]; then branch=$$(git -C "$(PROJECT_ROOT)" branch --show-current); fi; \
	[ -n "$$branch" ] || { echo "当前为 detached HEAD，请通过 BRANCH=<name> 指定分支。"; exit 1; }; \
	git check-ref-format --branch "$$branch" >/dev/null || exit 1; \
	git -C "$(PROJECT_ROOT)" push -u "$(REMOTE)" "HEAD:refs/heads/$$branch"

publish: ensure-standalone
	@$(MAKE) --no-print-directory bump-version
	@$(MAKE) --no-print-directory push
