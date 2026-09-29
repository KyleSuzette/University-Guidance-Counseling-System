from getpass import getpass

from app import create_app
from app.enums import UserRole
from app.extensions import db
from app.models import User
from app.utils import validate_email, validate_password


app = create_app()


with app.app_context():

    print("\n=== CREATE FIRST ADMIN ACCOUNT ===\n")

    email = input("Admin email: ").strip().lower()
    password = getpass("Admin password: ")
    confirm_password = getpass("Confirm password: ")

    if not validate_email(email):
        print("\nEnter a valid email address.")
        raise SystemExit

    password_error = validate_password(password)
    if password_error:
        print(f"\n{password_error}")
        raise SystemExit

    if password != confirm_password:
        print("\nPasswords do not match.")
        raise SystemExit

    existing_user = db.session.scalar(
        db.select(User).filter_by(email=email)
    )

    if existing_user:
        print("\nAn account with that email already exists.")
        raise SystemExit

    admin = User(
        email=email,
        role=UserRole.ADMIN,
        is_active=True
    )

    admin.set_password(password)

    db.session.add(admin)
    db.session.commit()

    print("\nAdmin account created successfully.")
    print(f"Email: {admin.email}")
    print(f"Role: {admin.role.value}")
    print(f"User ID: {admin.id}")
