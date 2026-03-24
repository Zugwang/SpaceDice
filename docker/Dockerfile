# SpaceDice Reloaded - Production Image
FROM python:3.12-slim

WORKDIR /app

# Install only production dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir flask gunicorn requests python-dotenv

# Copy application
COPY app/ ./app/
COPY templates/ ./templates/
COPY static/ ./static/
COPY scripts/ ./scripts/
COPY data/ ./data/
COPY gunicorn.conf.py .

# Create non-root user
RUN useradd -m -u 1000 spacedice && chown -R spacedice:spacedice /app
USER spacedice

EXPOSE 8000

CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:create_app()"]
