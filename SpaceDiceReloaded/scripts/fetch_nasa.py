#!/usr/bin/env python3
"""Cron script to fetch NASA NEO data daily."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.nasa import update_neo_cache


if __name__ == '__main__':
    try:
        count = update_neo_cache()
        print(f"[OK] Cached {count} NEOs")
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
