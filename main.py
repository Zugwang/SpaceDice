import requests
import json
import os
import hashlib
import markdown
from secrets import SystemRandom
from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request

load_dotenv()

app = Flask(__name__)

nasa_api_key = os.environ['NASA_API_KEY']

insight_api_url = "https://api.nasa.gov/insight_weather/?api_key=DEMO_KEY&feedtype=json&ver=1.0"
# mars weather not randomm at all
fireball_api_url = "https://ssd-api.jpl.nasa.gov/fireball.api?limit=10"
# to few events (3 per month)
neoWs_api_url_today =  "https://api.nasa.gov/neo/rest/v1/feed/today?api_key=DEMO_KEY"
neoWs_api_url_browse =  "https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=DEMO_KEY"
neoWs_api_url_browse_100 =  "https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=DEMO_KEY"
# perfectly randomn, to study and try, maybe to much data on an objects

## DONKI 
solar_flare_api_url = "https://api.nasa.gov/DONKI/FLR?api_key=DEMO_KEY"
# to few randomness in the objects returned
solar_energetic_particule_api_url = "https://api.nasa.gov/DONKI/SEP?api_key=DEMO_KEY"
# sucks
interplanetary_shock_api_url = "https://api.nasa.gov/DONKI/IPS?api_key=DEMO_KEY"
# don't understand at all those fucking scientist
magnetopause = "https://api.nasa.gov/DONKI/MPC?api_key=DEMO_KEY"

data_filename = 'neows_data.json'

def save_data_to_file(data, filename):
    with open(filename, 'w') as f:
        json.dump(data, f , indent=2)

def load_data_from_file(filename):
    with open(filename, 'r') as f:
        return json.load(f)

def remove_decimal_point(num):
    # Convert the float to a string
    num_str = str(num)
    # Remove the decimal point
    num_str = num_str.replace('.', '')
    return num_str

def call_api(api_url):
    response = requests.get(api_url)
    if response.status_code == 200:
        api_data = response.json()
        return api_data 

def generate_seed(fruit):
    """
    Generate a seed by hashing the diameter_seed to ensure it conforms to expectations
    of a CSPRNG.
    """
    hash_object = hashlib.sha256(fruit.encode())
    hash_digest = hash_object.hexdigest()
    # Convert the hash digest to an integer seed
    seed = int(hash_digest, 16)
    return seed

def csprng_rnd(seed, lower_bound, upper_bound):
    """
    Generate a secure random number between lower_bound and upper_bound using CSPRNG.
    """
    sys_random = SystemRandom()
    sys_random.seed(seed)  # Seed the random number generator
    return sys_random.randint(lower_bound, upper_bound)

def format_neos(data_dict):
    neos_formatted = []
    for date in data_dict["near_earth_objects"]:
        for neo in data_dict["near_earth_objects"][date]:
            diameter_seed_min = neo['estimated_diameter']['meters']['estimated_diameter_min']
            diameter_seed_max = neo['estimated_diameter']['meters']['estimated_diameter_max']
            diameter_seed_str = remove_decimal_point(diameter_seed_min*diameter_seed_max)
            format_neo = {
                "neo_name": neo["name"],
                "is_potentially_hazardous": neo["is_potentially_hazardous_asteroid"],
                "estimated_diameter_min": diameter_seed_min,
                "estimated_diameter_max": diameter_seed_max,
                "seed": generate_seed(diameter_seed_str),
            }
            neos_formatted.append(format_neo)
    return neos_formatted

def dice_result(all_neos, dice_type):
    random_neo = SystemRandom().choice(all_neos)
    return csprng_rnd(random_neo["seed"], 1, dice_type) 

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/dice')
def dice():
    return render_template('dice.html')

@app.route('/doc')
def doc():
    with open('static/docs/doc.md', 'r') as markdown_file:
        doc_content = markdown_file.read()
        doc_content_html = markdown.markdown(doc_content)
    return render_template('doc.html', doc_content=doc_content_html)

@app.route('/get-data', methods=['GET'])
def get_data():
    data_dict = call_api(neoWs_api_url_today)
    save_data_to_file(data_dict, data_filename)
    return jsonify({'message': 'Data fetched and stored successfully'})

@app.route('/roll-dice', methods=['GET'])
def roll_dice():
    dice_type = int(request.args.get('dice_type', 6))  # Default to 6-sided dice if not specified
    try:
        data_dict = load_data_from_file(data_filename)
    except FileNotFoundError:
        get_data()
        data_dict = load_data_from_file(data_filename)
        
    all_neos = format_neos(data_dict)
    roll = dice_result(all_neos, dice_type)
    return jsonify({'random_number': roll})


if __name__ == "__main__":
    app.run(debug=True)


