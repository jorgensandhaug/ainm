UV := uv
ROUND_ID := 00000000-0000-0000-0000-000000000001
PROJECT_PATHS := .env.example .gitattributes .gitignore Makefile README.md apps configs data docs notebooks pyproject.toml pytest.ini ruff.toml src tests uv.lock

.PHONY: sync test lint format report status-project stage-project stage-data check-data-tracked

sync:
	$(UV) sync --extra dev

test:
	$(UV) run pytest

lint:
	$(UV) run ruff check .
	$(UV) run mypy src tests

format:
	$(UV) run ruff format .

report:
	$(UV) run astar replay-round --round-id $(ROUND_ID)
	$(UV) run astar build-submission --round-id $(ROUND_ID) --model static_semantic
	$(UV) run astar round-report --round-id $(ROUND_ID) --seed-index 0

status-project:
	git status --short -- $(PROJECT_PATHS)

stage-project:
	git add -- $(PROJECT_PATHS)

stage-data:
	git add -- data

check-data-tracked:
	@untracked="$$(git ls-files --others --exclude-standard -- data)"; \
	if [ -n "$$untracked" ]; then \
		printf 'untracked data files:\n%s\n' "$$untracked"; \
		exit 1; \
	fi
