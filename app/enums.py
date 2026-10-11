
from enum import Enum


class StrEnum(str, Enum):
    pass


class UserRole(StrEnum):
    STUDENT = "student"
    COUNSELOR = "counselor"
    HEAD_COUNSELOR = "head_counselor"
    ADMIN = "admin"
    STAFF = "staff"


class ReferralStatus(StrEnum):
    NEW = "NEW"
    TRIAGED = "TRIAGED"
    ASSIGNED = "ASSIGNED"
    CLOSED = "CLOSED"


class Priority(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class CaseStatus(StrEnum):
    INTAKE = "INTAKE"
    ACTIVE = "ACTIVE"
    FOLLOW_UP = "FOLLOW_UP"
    PENDING_CLOSURE = "PENDING_CLOSURE"
    REVISION_REQUIRED = "REVISION_REQUIRED"
    CLOSED = "CLOSED"


class AppointmentStatus(StrEnum):
    REQUESTED = "REQUESTED"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class ClearanceStatus(StrEnum):
    NOT_CLEARED = "NOT_CLEARED"
    CLEARED = "CLEARED"

class ClearanceAccessStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class ExitReviewStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    RETURNED = "RETURNED"
