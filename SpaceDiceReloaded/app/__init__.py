from flask import Flask
from dotenv import load_dotenv


def create_app():
    load_dotenv()
    app = Flask(__name__,
                template_folder='../templates',
                static_folder='../static')

    from . import routes
    app.register_blueprint(routes.bp)

    return app
