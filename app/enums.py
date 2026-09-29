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

