# EMUS-2 co-design monitor. Run `make setup` once, then `make dev`.
PY := .venv/bin/python
PORT ?= 8000

.PHONY: setup dev backend frontend build serve test test-backend test-frontend types e2e mimic clean

setup:            ## install backend and frontend dependencies
	python3 -m venv .venv
	.venv/bin/pip install -q -r backend/requirements-dev.txt
	cd frontend && npm install --no-audit --no-fund

dev:              ## backend on :8000 and Vite dev server on :5173 (open the Vite URL)
	$(MAKE) -j2 backend frontend

backend:
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --host 0.0.0.0 --port $(PORT)

frontend:
	cd frontend && npm run dev

build:            ## build the frontend into frontend/dist
	cd frontend && npm run build

serve: build      ## one server for tablets on the same network: http://<this-computer>:8000
	cd backend && ../$(PY) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT)

types:            ## regenerate frontend types after changing backend/app/models
	$(PY) scripts/gen_types.py

test: test-backend test-frontend   ## everything except the browser check

test-backend:
	cd backend && ../$(PY) -m pytest -q
	$(PY) scripts/gen_types.py --check

test-frontend:
	cd frontend && npm run typecheck && npm test

e2e:              ## browser check against a running `make serve`
	cd frontend && npm run e2e

mimic:            ## download and import the open-access MIMIC-IV demo (milestone M6)
	$(PY) scripts/import_mimic_demo.py

clean:
	rm -rf frontend/dist frontend/e2e/screenshots backend/.pytest_cache

.PHONY: screenshots
screenshots: build  ## regenerate the pictures in docs/screenshots (starts a temporary server)
	@rm -f /tmp/emus-shots.db; cd backend && EMUS_DB=/tmp/emus-shots.db ../.venv/bin/python -m uvicorn app.main:app --port 8125 >/tmp/emus-shots.log 2>&1 & echo $$! > /tmp/emus-shots.pid; sleep 4; \
	cd frontend && node e2e/screenshots.cjs http://127.0.0.1:8125; status=$$?; kill `cat /tmp/emus-shots.pid` 2>/dev/null; exit $$status
