import os
from datetime import datetime, timezone, timedelta
from flask import Blueprint, render_template, jsonify, request
from .db import get_neos, get_stats, DB_FILE

bp = Blueprint('main', __name__)

NEO_WINDOW_DAYS = 30  # entropy pool default: last 30 days of NEOs


def _load_data():
    api_key = os.getenv('NASA_API_KEY', 'DEMO_KEY')
    is_demo = (not api_key or api_key == 'DEMO_KEY')

    if not DB_FILE.exists():
        return [], {
            'is_demo_key': is_demo,
            'neo_count': 0,
            'is_fresh': False,
            'oldest_date': None,
            'newest_date': None,
            'last_fetch': None,
            'db_active': False,
        }

    neos = get_neos(days=NEO_WINDOW_DAYS)
    stats = get_stats()

    is_fresh = False
    if stats['last_fetch']:
        try:
            dt = datetime.fromisoformat(stats['last_fetch'])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            is_fresh = (datetime.now(timezone.utc) - dt) < timedelta(days=2)
        except (ValueError, TypeError):
            pass

    return neos, {
        'is_demo_key': is_demo,
        'neo_count': len(neos),
        'is_fresh': is_fresh,
        'oldest_date': stats['oldest'],
        'newest_date': stats['newest'],
        'last_fetch': stats['last_fetch'],
        'db_active': True,
    }


@bp.route('/')
def index():
    neo_data, data_meta = _load_data()
    return render_template('index.html', neo_data=neo_data, data_meta=data_meta)


@bp.route('/api/neos')
def api_neos():
    range_param = request.args.get('range', '42days')
    today = datetime.now(timezone.utc).date()

    if range_param == 'today':
        neos = get_neos(days=1)
    elif range_param == 'week':
        neos = get_neos(days=7)
    elif range_param == 'thisyear':
        days_since_jan1 = (today - today.replace(month=1, day=1)).days + 1
        neos = get_neos(days=days_since_jan1)
    elif range_param == 'all':
        neos = get_neos(days=None, limit=2000)
    else:  # month
        neos = get_neos(days=30)

    return jsonify(neos)
