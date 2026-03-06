"""NASA NeoWs API client — fetch and parse Near Earth Objects."""

import os
import hashlib
import requests

NEOWS_FEED_URL = "https://api.nasa.gov/neo/rest/v1/feed"


def _api_key() -> str:
    return os.getenv('NASA_API_KEY', 'DEMO_KEY')


def generate_seed(value: str) -> int:
    """Hash any string to a JS-safe integer seed (< 2^53)."""
    digest = hashlib.sha256(value.encode()).hexdigest()
    return int(digest, 16) % (2 ** 53)


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
        'diameter_min':  round(d_min, 2),
        'diameter_max':  round(d_max, 2),
        'velocity_kms':  round(v_kms, 2),
        'velocity_kmh':  round(v_kmh, 0),
        'distance_km':   round(dist_km, 0),
        'distance_lunar': round(dist_lunar, 2),
        'seeds': {
            'diameter': generate_seed(f"{d_min * d_max}"),
            'velocity': generate_seed(f"{v_kms * v_kmh}"),
            'distance': generate_seed(f"{dist_km}"),
            'combined': generate_seed(f"{d_min}{v_kms}{dist_km}"),
        },
    }


def fetch_neo_date_range(start_date: str, end_date: str) -> list:
    """
    Fetch and parse NEOs for a date range.
    NASA API limit: max 7 days per request.
    start_date / end_date: 'YYYY-MM-DD'
    """
    url = (
        f"{NEOWS_FEED_URL}"
        f"?start_date={start_date}&end_date={end_date}"
        f"&api_key={_api_key()}"
    )
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()

    neos = []
    for date_key, neo_list in data.get('near_earth_objects', {}).items():
        for neo in neo_list:
            try:
                neos.append(_parse_neo(neo, date_key))
            except (KeyError, ValueError, IndexError):
                pass  # skip malformed entries
    return neos
