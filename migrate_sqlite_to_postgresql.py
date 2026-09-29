import os
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app import create_app
from app.extensions import db


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
SQLITE_PATH = BASE_DIR / "instance" / "guidance.db"

# Tables are ordered according to foreign-key dependencies.
TABLE_ORDER = [
    "users",
    "account_settings",
    "student_profiles",
    "counselor_profiles",
    "staff_profiles",
    "rooms",
    "referrals",
    "counseling_cases",
    "progress_notes",
    "appointments",
    "exit_questionnaires",
    "exit_questions",
    "exit_submissions",
    "exit_responses",
    "clearances",
    "audit_logs",
    "revoked_tokens",
]


def get_database_url():
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set.\n"
            "Set DATABASE_URL to your Supabase PostgreSQL connection string "
            "before running this migration."
        )

    if database_url.startswith("postgres://"):
        database_url = (
            "postgresql://" + database_url.removeprefix("postgres://")
        )

    if database_url.startswith("sqlite"):
        raise RuntimeError(
            "DATABASE_URL points to SQLite. "
            "It must point to Supabase PostgreSQL."
        )

    return database_url


def get_sqlite_connection():
    if not SQLITE_PATH.exists():
        raise FileNotFoundError(
            f"SQLite database not found: {SQLITE_PATH}"
        )

    connection = sqlite3.connect(SQLITE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def get_source_counts(connection):
    counts = {}

    for table in TABLE_ORDER:
        row = connection.execute(
            f'SELECT COUNT(*) AS count FROM "{table}"'
        ).fetchone()

        counts[table] = row["count"]

    return counts


def print_counts(title, counts):
    print()
    print(title)
    print("-" * 45)

    for table in TABLE_ORDER:
        print(f"{table:25} {counts.get(table, 0)}")


def create_postgresql_schema(database_url):
    print()
    print("Creating/verifying PostgreSQL schema...")

    # create_app() reads DATABASE_URL from the environment.
    os.environ["DATABASE_URL"] = database_url

    app = create_app()

    with app.app_context():
        db.create_all()

    print("PostgreSQL schema ready.")


def verify_target_tables(engine):
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    missing = [
        table
        for table in TABLE_ORDER
        if table not in existing_tables
    ]

    if missing:
        raise RuntimeError(
            "The following PostgreSQL tables were not created: "
            + ", ".join(missing)
        )


def target_has_data(connection):
    populated = {}

    for table in TABLE_ORDER:
        count = connection.execute(
            text(f'SELECT COUNT(*) FROM "{table}"')
        ).scalar_one()

        if count > 0:
            populated[table] = count

    return populated


def copy_table(sqlite_connection, pg_connection, table):
    rows = sqlite_connection.execute(
        f'SELECT * FROM "{table}"'
    ).fetchall()

    if not rows:
        print(f"{table:25} 0 rows")
        return 0

    columns = rows[0].keys()

    # Read the destination PostgreSQL column types so SQLite
    # values can be converted to their proper PostgreSQL types.
    pg_columns = {
        column["name"]: column["type"]
        for column in inspect(pg_connection).get_columns(table)
    }

    column_sql = ", ".join(
        f'"{column}"'
        for column in columns
    )

    value_sql = ", ".join(
        f":{column}"
        for column in columns
    )

    insert_statement = text(
        f'INSERT INTO "{table}" ({column_sql}) '
        f'VALUES ({value_sql})'
    )

    records = []

    for row in rows:
        record = {}

        for column in columns:
            value = row[column]
            pg_type = pg_columns.get(column)

            if value is not None and pg_type is not None:
                type_name = pg_type.__class__.__name__.upper()

                # SQLite stores BOOLEAN values as integers 0/1.
                if type_name == "BOOLEAN":
                    value = bool(value)

            record[column] = value

        records.append(record)

    pg_connection.execute(insert_statement, records)

    print(f"{table:25} {len(records)} rows")

    return len(records)


def reset_postgresql_sequences(connection):
    print()
    print("Resetting PostgreSQL ID sequences...")

    for table in TABLE_ORDER:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns(table)
        }

        if "id" not in columns:
            continue

        sequence_name = connection.execute(
            text(
                "SELECT pg_get_serial_sequence(:table_name, 'id')"
            ),
            {"table_name": table},
        ).scalar()

        if not sequence_name:
            continue

        max_id = connection.execute(
            text(f'SELECT MAX("id") FROM "{table}"')
        ).scalar()

        if max_id is None:
            connection.execute(
                text(
                    "SELECT setval("
                    "CAST(:sequence_name AS regclass), 1, false)"
                ),
                {"sequence_name": sequence_name},
            )
        else:
            connection.execute(
                text(
                    "SELECT setval("
                    "CAST(:sequence_name AS regclass), "
                    ":max_id, true)"
                ),
                {
                    "sequence_name": sequence_name,
                    "max_id": max_id,
                },
            )

    print("Sequences updated.")


def get_target_counts(connection):
    counts = {}

    for table in TABLE_ORDER:
        counts[table] = connection.execute(
            text(f'SELECT COUNT(*) FROM "{table}"')
        ).scalar_one()

    return counts


def main():
    print("=" * 60)
    print("University Guidance & Counseling Database Migration")
    print("SQLite -> Supabase PostgreSQL")
    print("=" * 60)

    database_url = get_database_url()

    sqlite_connection = get_sqlite_connection()

    try:
        source_counts = get_source_counts(sqlite_connection)
        print_counts("SQLite source records", source_counts)

        create_postgresql_schema(database_url)

        engine = create_engine(
            database_url,
            pool_pre_ping=True,
        )

        verify_target_tables(engine)

        with engine.begin() as pg_connection:

            existing = target_has_data(pg_connection)

            if existing:
                print()
                print("MIGRATION STOPPED")
                print("-" * 45)
                print(
                    "The Supabase database already contains data."
                )
                print(
                    "This safety check prevents duplicate records."
                )
                print()

                for table, count in existing.items():
                    print(f"{table:25} {count}")

                print()
                print(
                    "No records were copied. "
                    "Review the target database before retrying."
                )
                return

            print()
            print("Copying records...")
            print("-" * 45)

            for table in TABLE_ORDER:
                copy_table(
                    sqlite_connection,
                    pg_connection,
                    table,
                )

            reset_postgresql_sequences(pg_connection)

        # Verify after the transaction has committed.
        with engine.connect() as pg_connection:
            target_counts = get_target_counts(pg_connection)

        print_counts(
            "Supabase PostgreSQL records",
            target_counts,
        )

        mismatches = []

        for table in TABLE_ORDER:
            source = source_counts[table]
            target = target_counts[table]

            if source != target:
                mismatches.append(
                    (table, source, target)
                )

        print()

        if mismatches:
            print("MIGRATION VERIFICATION FAILED")
            print("-" * 45)

            for table, source, target in mismatches:
                print(
                    f"{table}: SQLite={source}, "
                    f"PostgreSQL={target}"
                )

            raise RuntimeError(
                "Record counts do not match."
            )

        print("=" * 60)
        print("MIGRATION SUCCESSFUL")
        print("All table record counts match.")
        print("=" * 60)

    finally:
        sqlite_connection.close()


if __name__ == "__main__":
    main()