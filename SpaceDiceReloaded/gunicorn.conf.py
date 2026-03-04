# Gunicorn configuration for SpaceDice Reloaded

bind = "0.0.0.0:8000"
workers = 2
threads = 2
worker_class = "sync"

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Security
limit_request_line = 4094
limit_request_fields = 100
