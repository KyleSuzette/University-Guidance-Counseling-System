from flask import Flask, jsonify, render_template, request
from sqlalchemy.exc import IntegrityError

from .config import Config
from .extensions import cors, db, jwt
from .routes.admin import admin_bp
from .routes.appointments import appointments_bp
from .routes.auth import auth_bp
from .routes.cases import cases_bp
from .routes.clearances import clearances_bp
from .routes.exit_questionnaires import exit_bp
from .routes.profiles import profiles_bp
from .routes.referrals import referrals_bp
from .routes.reports import reports_bp


def create_app(config_object=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    if config_object:
        app.config.from_object(config_object)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGINS"]}},
        supports_credentials=False,
    )

    for blueprint in (
        auth_bp,
        profiles_bp,
        referrals_bp,
        cases_bp,
        appointments_bp,
        exit_bp,
        clearances_bp,
        reports_bp,
        admin_bp,
    ):
        app.register_blueprint(blueprint, url_prefix="/api/v1")

    @app.get("/")
    def login_page():
        return render_template("login.html")

    @app.get("/register")
    def register_page():
        return render_template("register.html")

    @app.get("/dashboard")
    def dashboard_page():
        return render_template("dashboard.html")

    @app.get("/profile")
    def profile_page():
        return render_template("profile.html")

    @app.get("/appointments")
    def appointments_page():
        return render_template("appointments.html")

    @app.get("/referrals")
    def referrals_page():
        return render_template("referrals.html")

    @app.get("/cases")
    def cases_page():
        return render_template("cases.html")

    @app.get("/exit-questionnaire")
    def exit_questionnaire_page():
        return render_template("exit_questionnaire.html")

    @app.get("/manage-exit-questionnaire")
    def manage_exit_questionnaire_page():
        return render_template("manage_exit_questionnaire.html")

    @app.get("/clearance")
    def clearance_page():
        return render_template("clearance.html")

    @app.get("/admin-management")
    def admin_management_page():
        return render_template("admin_management.html")

    @app.get("/api/v1/health")
    def health():
        return jsonify(status="ok", service="guidance-backend"), 200

    @app.after_request
    def secure_response(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify(error="not_found", message="Resource not found."), 404

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify(error="method_not_allowed", message="Method not allowed."), 405

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(
            error="payload_too_large", message="Request payload is too large."
        ), 413

    @app.errorhandler(IntegrityError)
    def integrity_error(_error):
        db.session.rollback()
        return jsonify(
            error="database_conflict",
            message="The submitted record conflicts with existing data.",
        ), 409

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        app.logger.exception("Unhandled application error", exc_info=error)
        return jsonify(
            error="internal_server_error", message="An unexpected error occurred."
        ), 500

    @jwt.unauthorized_loader
    def missing_token(message):
        return jsonify(error="authorization_required", message=message), 401

    @jwt.invalid_token_loader
    def invalid_token(message):
        return jsonify(error="invalid_token", message=message), 422

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return jsonify(error="token_expired", message="Access token has expired."), 401

    @jwt.revoked_token_loader
    def revoked_token(_header, _payload):
        return jsonify(error="token_revoked", message="Token has been revoked."), 401

    @jwt.token_in_blocklist_loader
    def is_token_revoked(_header, payload):
        from .models import AccountSettings, RevokedToken

        try:
            settings = db.session.get(AccountSettings, int(payload["sub"]))
        except (ValueError, TypeError, KeyError):
            return True
        if payload.get("session_version", 0) != (settings.session_version if settings else 0):
            return True

        return (
            db.session.scalar(
                db.select(RevokedToken).filter_by(jti=payload["jti"])
            )
            is not None
        )

    with app.app_context():
        db.create_all()

    return app
