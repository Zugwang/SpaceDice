"""SQLite persistence layer for NASA NEO data."""

import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

DB_FILE = Path(__file__).parent.parent / 'data' / 'neows.db'

_SCHEMA = """
CREATE TABLE IF NOT EXISTS neos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nasa_id        TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    approach_date  TEXT    NOT NULL,   -- YYYY-MM-DD
    fetched_at     TEXT    NOT NULL,   -- ISO 8601 UTC
    hazardous      INTEGER NOT NULL,   -- 0 | 1
    diameter_min   REAL    NOT NULL,   -- metres
    diameter_max   REAL    NOT NULL,   -- metres
    velocity_kms   REAL    NOT NULL,   -- km/s
    velocity_kmh   REAL    NOT NULL,   -- km/h
    distance_km    REAL    NOT NULL,   -- km
    distance_lunar REAL    NOT NULL,   -- lunar distances
    seed_diameter  INTEGER NOT NULL,
    seed_velocity  INTEGER NOT NULL,
    seed_distance  INTEGER NOT NULL,
    seed_combined  INTEGER NOT NULL,
    UNIQUE(nasa_id, approach_date)
);
CREATE INDEX IF NOT EXISTS idx_approach_date ON neos(approach_date);
"""


def _connect() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def upsert_neos(neos: list) -> int:
    """Insert or update NEOs. Returns number of affected rows."""
    fetched_at = datetime.now(timezone.utc).isoformat()
    affected = 0
    with _connect() as conn:
        for neo in neos:
            s = neo['seeds']
            conn.execute("""
                INSERT INTO neos (
                    nasa_id, name, approach_date, fetched_at, hazardous,
                    diameter_min, diameter_max,
                    velocity_kms, velocity_kmh,
                    distance_km, distance_lunar,
                    seed_diameter, seed_velocity, seed_distance, seed_combined
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(nasa_id, approach_date) DO UPDATE SET
                    fetched_at     = excluded.fetched_at,
                    velocity_kms   = excluded.velocity_kms,
                    velocity_kmh   = excluded.velocity_kmh,
                    distance_km    = excluded.distance_km,
                    distance_lunar = excluded.distance_lunar,
                    seed_velocity  = excluded.seed_velocity,
                    seed_distance  = excluded.seed_distance,
                    seed_combined  = excluded.seed_combined
            """, (
                neo['id'], neo['name'], neo['approach_date'], fetched_at,
                int(neo['hazardous']),
                neo['diameter_min'], neo['diameter_max'],
                neo['velocity_kms'], neo['velocity_kmh'],
                neo['distance_km'], neo['distance_lunar'],
                s['diameter'], s['velocity'], s['distance'], s['combined'],
            ))
            affected += conn.execute("SELECT changes()").fetchone()[0]
    return affected


def get_neos(days: int = 90) -> list:
    """Return NEOs from the last N days in the format expected by the frontend."""
    with _connect() as conn:
        rows = conn.execute("""
            SELECT
                nasa_id       AS id,
                name, approach_date, hazardous,
                diameter_min, diameter_max,
                velocity_kms, velocity_kmh,
                distance_km, distance_lunar,
                seed_diameter, seed_velocity, seed_distance, seed_combined
            FROM neos
            WHERE approach_date >= date('now', ?)
            ORDER BY approach_date DESC
        """, (f'-{days} days',)).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d['hazardous'] = bool(d['hazardous'])
        d['seeds'] = {
            'diameter': d.pop('seed_diameter'),
            'velocity': d.pop('seed_velocity'),
            'distance': d.pop('seed_distance'),
            'combined': d.pop('seed_combined'),
        }
        result.append(d)
    return result


def get_stats() -> dict:
    """Return DB statistics."""
    with _connect() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*)           AS count,
                MIN(approach_date) AS oldest,
                MAX(approach_date) AS newest,
                MAX(fetched_at)    AS last_fetch
            FROM neos
        """).fetchone()
    return dict(row) if row else {'count': 0, 'oldest': None, 'newest': None, 'last_fetch': None}
