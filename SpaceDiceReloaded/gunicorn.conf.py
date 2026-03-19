# Gunicorn configuration for SpaceDice Reloaded
#
# Production (systemd): binds to unix socket — nginx proxies to it.
# Development: override with  gunicorn -b 127.0.0.1:8000

import os
import multiprocessing

# Socket — used by systemd + nginx
# Dev override: GUNICORN_BIND=127.0.0.1:8000
bind = os.getenv("GUNICORN_BIND", "unix:/run/spacedice/gunicorn.sock")

# Workers: 2×CPU+1 is the classic formula.
# Default 3 is safe for a 1–2 vCPU VPS.
workers = int(os.getenv("GUNICORN_WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 5)))
threads = 2
worker_class = "sync"

# Logging — systemd captures stdout/stderr via journald
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Security
limit_request_line = 4094
limit_request_fields = 100

# Graceful restart timeout
graceful_timeout = 30
timeout = 120
