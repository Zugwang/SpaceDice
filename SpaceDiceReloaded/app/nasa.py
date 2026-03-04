"""NASA API integration for fetching NEO (Near Earth Objects) data."""

import os
import json
import hashlib
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

NASA_API_KEY = os.getenv('NASA_API_KEY', 'DEMO_KEY')
NEOWS_URL = f"https://api.nasa.gov/neo/rest/v1/feed/today?api_key={NASA_API_KEY}"
DATA_FILE = Path(__file__).parent.parent / 'data' / 'neows_data.json'


def generate_seed(value: str) -> int:
    """Generate a seed by hashing any string value."""
    hash_digest = hashlib.sha256(value.encode()).hexdigest()
    return int(hash_digest, 16) % (2**53)  # JS safe integer


def fetch_neo_data() -> list:
    """Fetch today's NEO data from NASA API."""
    response = requests.get(NEOWS_URL, timeout=30)
    response.raise_for_status()
    data = response.json()

    neos = []
    for date_key in data.get('near_earth_objects', {}):
        for neo in data['near_earth_objects'][date_key]:
            diameter = neo['estimated_diameter']['meters']

            # Get close approach data (first approach)
            close_approach = neo.get('close_approach_data', [{}])[0]
            velocity = close_approach.get('relative_velocity', {})
            miss_dist = close_approach.get('miss_distance', {})

            # Extract raw values
            diameter_min = diameter['estimated_diameter_min']
            diameter_max = diameter['estimated_diameter_max']
            velocity_kms = float(velocity.get('kilometers_per_second', 0))
            velocity_kmh = float(velocity.get('kilometers_per_hour', 0))
            distance_km = float(miss_dist.get('kilometers', 0))
            distance_lunar = float(miss_dist.get('lunar', 0))

            # Generate different seeds from different data sources
            seed_diameter = generate_seed(f"{diameter_min * diameter_max}")
            seed_velocity = generate_seed(f"{velocity_kms * velocity_kmh}")
            seed_distance = generate_seed(f"{distance_km}")
            seed_combined = generate_seed(f"{diameter_min}{velocity_kms}{distance_km}")

            neos.append({
                'name': neo['name'],
                'id': neo['id'],
                'hazardous': neo['is_potentially_hazardous_asteroid'],
                # Raw data
                'diameter_min': round(diameter_min, 2),
                'diameter_max': round(diameter_max, 2),
                'velocity_kms': round(velocity_kms, 2),
                'velocity_kmh': round(velocity_kmh, 0),
                'distance_km': round(distance_km, 0),
                'distance_lunar': round(distance_lunar, 2),
                'approach_date': close_approach.get('close_approach_date', ''),
                # Pre-computed seeds for each entropy source
                'seeds': {
                    'diameter': seed_diameter,
                    'velocity': seed_velocity,
                    'distance': seed_distance,
                    'combined': seed_combined
                }
            })

    return neos


def save_neo_data(neos: list) -> None:
    """Save NEO data to cache file with metadata."""
    from datetime import datetime, timezone
    DATA_FILE.parent.mkdir(exist_ok=True)
    payload = {
        '_meta': {
            'fetched_at': datetime.now(timezone.utc).isoformat(),
            'api_key_demo': (NASA_API_KEY == 'DEMO_KEY'),
            'count': len(neos),
        },
        'neos': neos,
    }
    with open(DATA_FILE, 'w') as f:
        json.dump(payload, f, indent=2)


def update_neo_cache() -> int:
    """Fetch and cache NEO data. Returns number of NEOs cached."""
    neos = fetch_neo_data()
    save_neo_data(neos)
    return len(neos)
