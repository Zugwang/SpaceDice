import requests
import json
import os
import hashlib
from secrets import SystemRandom
from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, redirect, url_for

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

def Call_api(api_url):
    response = requests.get(api_url) 

    if response.status_code == 200:
        api_data = json.loads(response.text)
        return api_data 

def save_data_to_file(data, filename):
    with open(filename, 'w') as f:
        json.dump(data, f , indent=2)

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

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/dice')
def dice():
    return render_template('index.html')

@app.route('/roll-dice', methods=['GET'])
def roll_dice():
    data_dict = call_api(neoWs_api_url_today)
    for date in data_dict["near_earth_objects"]:
        for neo in data_dict["near_earth_objects"][date]:
            diameter_seed = neo['estimated_diameter']['meters']['estimated_diameter_min']
            diameter_seed *= neo['estimated_diameter']['meters']['estimated_diameter_max']
            diameter_seed_str = remove_decimal_point(diameter_seed)
            seed = generate_seed(diameter_seed_str)
            random_number = csprng_rnd(seed, 1, 6)  # For a 6-sided dice
            return jsonify({'random_number': random_number})
    return jsonify({'error': 'No NEOs found'})


if __name__ == "__main__":
    app.run(debug=True)



# if __name__ == "__main__":
#     print("Hello space!")
#     data_dict = Call_api(neoWs_api_url_today.replace("DEMO_KEY", nasa_api_key))
#     save_data_to_file(data_dict, 'neoWs_data.json')

#     print("Count: "+str(data_dict["element_count"]))

#     for date in data_dict["near_earth_objects"]:
#         for neo in data_dict["near_earth_objects"][date]:
#             if neo['is_potentially_hazardous_asteroid']:
#                 hazardousness = 'HAZARDOUS'
#             else:
#                 hazardousness = 'Safe'
#             print(f"Name: {neo['name']}")
#             diameter_seed = neo['estimated_diameter']['meters']['estimated_diameter_min']
#             diameter_seed *= neo['estimated_diameter']['meters']['estimated_diameter_max']

#             diameter_seed_str = remove_decimal_point(diameter_seed)
#             print(diameter_seed_str)

#             # Generate a secure seed using the hashed diameter_seed_str
#             seed = generate_seed(diameter_seed_str)
#             print(f"Secure seed: {seed}")

#             random_number = csprng_rnd(seed, 1, 10)
#             print(f"Random Number: {random_number}")
