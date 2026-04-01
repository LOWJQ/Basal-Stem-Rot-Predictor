import json
import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
DB_TIMEOUT_SECONDS = 30


def _connect(row_factory=None):
    conn = sqlite3.connect(DB_PATH, timeout=DB_TIMEOUT_SECONDS)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    if row_factory is not None:
        conn.row_factory = row_factory
    return conn


def _ensure_column(conn, table_name, column_name, column_definition):
    columns = {
        row[1]
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name not in columns:
        conn.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )


def init_db():
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT NOT NULL,
                title       TEXT,
                lat         REAL,
                lon         REAL,
                altitude    REAL,
                infected_count     INTEGER,
                avg_risk_score     REAL,
                high_cells         INTEGER,
                medium_cells       INTEGER,
                low_cells          INTEGER,
                env_summary        TEXT,
                payload            TEXT
            )
        """)
        _ensure_column(conn, "scans", "payload", "TEXT")
        _ensure_column(conn, "scans", "title", "TEXT")


def save_scan(lat, lon, altitude, infected_points, heatmap, env_summary, payload=None, title=None):
    high   = sum(1 for c in heatmap if c["risk"] == "high")
    medium = sum(1 for c in heatmap if c["risk"] == "medium")
    low    = sum(1 for c in heatmap if c["risk"] == "low")
    avg_risk = sum(c["risk_score"] for c in heatmap) / len(heatmap) if heatmap else 0

    if not title:
        title = f"Scan {datetime.now().strftime('%b %d, %I:%M %p')}"

    with _connect() as conn:
        cursor = conn.execute("""
            INSERT INTO scans
            (timestamp, title, lat, lon, altitude, infected_count, avg_risk_score,
            high_cells, medium_cells, low_cells, env_summary, payload)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            datetime.utcnow().isoformat(),
            title,
            lat, lon, altitude,
            len(infected_points),
            round(avg_risk, 4),
            high, medium, low,
            json.dumps(env_summary),
            json.dumps(payload) if payload is not None else None,
        ))
        return cursor.lastrowid


def _deserialize_scan(row, include_payload=False):
    scan = dict(row)
    scan["env_summary"] = json.loads(scan["env_summary"]) if scan["env_summary"] else None
    if include_payload:
        scan["payload"] = json.loads(scan["payload"]) if scan["payload"] else None
        if scan["payload"] is not None and "history_id" not in scan["payload"]:
            scan["payload"]["history_id"] = scan["id"]
    else:
        scan.pop("payload", None)
    return scan


def get_history(limit=20):
    with _connect(sqlite3.Row) as conn:
        rows = conn.execute(
            "SELECT * FROM scans ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        return [_deserialize_scan(row) for row in rows]


def get_scan(scan_id):
    with _connect(sqlite3.Row) as conn:
        row = conn.execute(
            "SELECT * FROM scans WHERE id = ?",
            (scan_id,),
        ).fetchone()
        if row is None:
            return None
        return _deserialize_scan(row, include_payload=True)


def update_scan_payload(scan_id, payload):
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE scans SET payload = ? WHERE id = ?",
            (json.dumps(payload) if payload is not None else None, scan_id),
        )
        return cursor.rowcount > 0


def update_scan_title(scan_id, title):
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE scans SET title = ? WHERE id = ?",
            (title, scan_id),
        )
        return cursor.rowcount > 0


def delete_scan(scan_id):
    with _connect() as conn:
        cursor = conn.execute(
            "DELETE FROM scans WHERE id = ?",
            (scan_id,),
        )
        return cursor.rowcount > 0

def delete_all_scans():
    with _connect() as conn:
        conn.execute("DELETE FROM scans")
