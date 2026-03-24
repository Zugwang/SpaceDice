"""NASA NeoWs API client — fetch and parse Near Earth Objects."""

import os
import hashlib
import logging
import time

import requests

log = logging.getLogger(__name__)

NEOWS_FEED_URL = "https://api.nasa.gov/neo/rest/v1/feed"
_MAX_RETRIES = 3


def _api_key() -> str:
    return os.getenv('NASA_API_KEY', 'DEMO_KEY')


def generate_seed(value: str) -> int:
    """Hash any string to a uint32 seed (matches JS bitwise ops)."""
    digest = hashlib.sha256(value.encode()).hexdigest()
    return int(digest, 16) % (2 ** 32)


def _parse_neo(neo: dict, approach_date: str) -> dict:
    """Parse a single NEO entry from NASA API response."""
    diameter = neo['estimated_diameter']['meters']
    close_approach = neo.get('close_approach_data', [{}])[0]
    velocity  = close_approach.get('relative_velocity', {})
    miss_dist = close_approach.get('miss_distance', {})

    d_min = diameter['estimated_diameter_min']
    d_max = diameter['estimated_diameter_max']
    v_kms = float(velocity.get('kilometers_per_second', 0))
    v_kmh = float(velocity.get('kilometers_per_hour', 0))
    dist_km    = float(miss_dist.get('kilometers', 0))
    dist_lunar = float(miss_dist.get('lunar', 0))

    return {
        'id':            neo['id'],
        'name':          neo['name'],
        'approach_date': approach_date,
        'hazardous':     neo['is_potentially_hazardous_asteroid'],
        'diameter_min':  d_min,
        'diameter_max':  d_max,
        'velocity_kms':  v_kms,
        'velocity_kmh':  v_kmh,
        'distance_km':   dist_km,
        'distance_lunar': dist_lunar,
        'seeds': {
            'diameter': generate_seed(f"{d_min * d_max}"),
            'velocity': generate_seed(f"{v_kms * v_kmh}"),
            'distance': generate_seed(f"{dist_km}"),
            'combined': generate_seed(f"{d_min}{v_kms}{dist_km}"),
        },
    }


def fetch_neo_date_range(start_date: str, end_date: str) -> list:
    """
    Fetch and parse NEOs for a date range with retry on failure.
    NASA API limit: max 7 days per request.
    start_date / end_date: 'YYYY-MM-DD'
    """
    url = (
        f"{NEOWS_FEED_URL}"
        f"?start_date={start_date}&end_date={end_date}"
        f"&api_key={_api_key()}"
    )

    last_exc = None
    for attempt in range(_MAX_RETRIES):
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            break
        except (requests.RequestException, ValueError) as exc:
            last_exc = exc
            wait = 2 ** attempt
            log.warning("NASA API attempt %d/%d failed: %s — retrying in %ds",
                        attempt + 1, _MAX_RETRIES, exc, wait)
            time.sleep(wait)
    else:
        log.error("NASA API failed after %d attempts: %s", _MAX_RETRIES, last_exc)
        return []

    neos = []
    for date_key, neo_list in data.get('near_earth_objects', {}).items():
        for neo in neo_list:
            try:
                neos.append(_parse_neo(neo, date_key))
            except (KeyError, ValueError, IndexError):
                pass  # skip malformed entries
    return neos
