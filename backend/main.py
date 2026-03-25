from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from routes.predict import predict_bp
from routes.health import health_bp
from routes.history import history_bp


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    CORS(app)

    app.register_blueprint(predict_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(history_bp)

    @app.route("/outputs/<path:filename>")
    def serve_outputs(filename):
        return send_from_directory("output", filename)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=False)