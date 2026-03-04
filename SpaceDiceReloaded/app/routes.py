import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from flask import Blueprint, render_template

bp = Blueprint('main', __name__)

DATA_FILE = Path(__file__).parent.parent / 'data' / 'neows_data.json'


def load_neo_data():
    """Load NASA NEO data. Returns (neos, meta) tuple."""
    api_key = os.getenv('NASA_API_KEY', 'DEMO_KEY')
    meta = {
        'is_demo_key': (api_key == 'DEMO_KEY' or not api_key),
        'fetched_at': None,
        'is_fresh': False,
        'neo_count': 0,
    }

    if not DATA_FILE.exists():
        return [], meta

    with open(DATA_FILE) as f:
        raw = json.load(f)

    # New format: dict with _meta + neos
    if isinstance(raw, dict) and 'neos' in raw:
        neos = raw['neos']
        file_meta = raw.get('_meta', {})
        meta['fetched_at'] = file_meta.get('fetched_at')
        meta['is_demo_key'] = file_meta.get('api_key_demo', meta['is_demo_key'])
    else:
        # Legacy format: plain list
        neos = raw

    meta['neo_count'] = len(neos)

    if meta['fetched_at']:
        try:
            dt = datetime.fromisoformat(meta['fetched_at'])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - dt
            meta['is_fresh'] = age < timedelta(days=2)
        except (ValueError, TypeError):
            pass

    return neos, meta


@bp.route('/')
def index():
    """Serve SPA with embedded NEO data and status metadata."""
    neo_data, data_meta = load_neo_data()
    return render_template('index.html', neo_data=neo_data, data_meta=data_meta)
