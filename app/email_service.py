import os
import smtplib
import logging

from email.message import EmailMessage
from email.utils import formataddr

logger = logging.getLogger(__name__)


def send_otp_email(receiver_email, otp, purpose="registration"):
    """Send a six-digit verification code using Brevo SMTP."""

    smtp_server = os.getenv("SMTP_SERVER", "smtp-relay.brevo.com")
    smtp_port = int(os.getenv("SMTP_PORT", "2525"))
    smtp_login = os.getenv("SMTP_LOGIN")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_sender = os.getenv("SMTP_SENDER")
    sender_name = os.getenv(
        "SMTP_SENDER_NAME",
        "University Guidance and Counseling"
    )

    if not all([smtp_login, smtp_password, smtp_sender]):
        logger.error("Brevo SMTP configuration is incomplete.")
        return False

    if purpose == "registration":
        subject = "Email Verification Code - University Guidance and Counseling"
        heading = "Account Registration"
    elif purpose == "reset":
        subject = "Password Reset Code - University Guidance and Counseling"
        heading = "Password Reset"
    else:
        logger.error("Invalid OTP email purpose.")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((sender_name, smtp_sender))
    message["To"] = receiver_email

    message.set_content(
        f"University Guidance and Counseling\n\n"
        f"{heading}\n\n"
        f"Your one-time verification code is: {otp}\n\n"
        f"This code expires in 5 minutes.\n"
        f"Do not share this code with anyone.\n\n"
        f"If you did not request this code, please ignore this email.\n\n"
        f"University Guidance and Counseling System"
    )

    try:
        with smtplib.SMTP(smtp_server, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_login, smtp_password)
            server.send_message(message)

        return True

    except (smtplib.SMTPException, OSError) as exc:
        logger.error(
            "Failed to send OTP email: %s",
            type(exc).__name__
        )
        return False