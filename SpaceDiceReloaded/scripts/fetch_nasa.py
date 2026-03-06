#!/usr/bin/env python3
"""
Fetch NASA NEO data into SQLite.

Usage:
  python scripts/fetch_nasa.py                    # daily cron: last 7 days
  python scripts/fetch_nasa.py --init             # first run: last 90 days
  python scripts/fetch_nasa.py --init --days 180  # longer history
"""

import sys
import time
import argparse
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.nasa import fetch_neo_date_range
from app.db import init_db, upsert_neos, get_stats


def fetch_range(start: date, end: date) -> int:
    """Fetch NEOs in 7-day chunks between start and end (inclusive)."""
    total = 0
    current = start
    while current <= end:
        chunk_end = min(current + timedelta(days=6), end)
        try:
            neos = fetch_neo_date_range(current.isoformat(), chunk_end.isoformat())
            inserted = upsert_neos(neos)
            print(f"  {current} → {chunk_end} : {len(neos):>3} NEOs fetched  ({inserted} new/updated)")
            total += inserted
        except Exception as e:
            print(f"  [WARN] {current} → {chunk_end} : {e}", file=sys.stderr)
        current = chunk_end + timedelta(days=1)
        if current <= end:
            time.sleep(0.3)  # gentle rate limiting
    return total


def fetch_backwards_from(start: date) -> int:
    """
    Fetch NEOs going backwards in 7-day chunks from start_date.
    Stops when the API returns an empty result or an error.
    Goal: aggregate all historical NEO data available from NASA.
    """
    total = 0
    chunk_end = start

    while True:
        chunk_start = chunk_end - timedelta(days=6)
        try:
            neos = fetch_neo_date_range(chunk_start.isoformat(), chunk_end.isoformat())
        except Exception as e:
            print(f"  [STOP] {chunk_start} → {chunk_end} : API error — {e}", file=sys.stderr)
            break

        if not neos:
            print(f"  [STOP] {chunk_start} → {chunk_end} : empty response, no more data.")
            break

        inserted = upsert_neos(neos)
        print(f"  {chunk_start} → {chunk_end} : {len(neos):>3} NEOs fetched  ({inserted} new/updated)")
        total += inserted
        chunk_end = chunk_start - timedelta(days=1)
        time.sleep(0.3)

    return total


def main():
    parser = argparse.ArgumentParser(description='Fetch NASA NEO data into SQLite')
    parser.add_argument(
        '--init', action='store_true',
        help='Initial populate: fetch N days of history (default: 90)',
    )
    parser.add_argument(
        '--days', type=int, default=90,
        help='Days of history to fetch with --init (default: 90)',
    )
    parser.add_argument(
        '--start-date', metavar='YYYY-MM-DD',
        help='Fetch from this date forward until empty response or API error',
    )
    args = parser.parse_args()

    init_db()
    today = date.today()

    if args.start_date:
        try:
            start = date.fromisoformat(args.start_date)
        except ValueError:
            print(f"[ERROR] Invalid date format: '{args.start_date}' — expected YYYY-MM-DD", file=sys.stderr)
            sys.exit(1)
        print(f"[HISTORICAL] Remontée depuis {start} vers le passé (s'arrête sur vide/erreur)")
        print(f"             Objectif : agréger toutes les données NASA accessibles")
        total = fetch_backwards_from(start)
    elif args.init:
        start = today - timedelta(days=args.days)
        n_chunks = args.days // 7 + 1
        print(f"[INIT] Fetching {args.days} days : {start} → {today}")
        print(f"       ~{n_chunks} API calls, expect {args.days * 5}–{args.days * 15} NEOs")
        total = fetch_range(start, today)
    else:
        start = today - timedelta(days=7)
        print(f"[DAILY] Refreshing last 7 days : {start} → {today}")
        total = fetch_range(start, today)

    stats = get_stats()
    print(
        f"\n[OK] +{total} rows inserted/updated"
        f" | DB total: {stats['count']} NEOs"
        f" | {stats['oldest']} → {stats['newest']}"
    )


if __name__ == '__main__':
    main()
