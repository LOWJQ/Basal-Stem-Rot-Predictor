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
            CREATE TABLE IF NOT EXISTS lands (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT,
                lat         REAL NOT NULL,
                lon         REAL NOT NULL,
                device_id   TEXT,
                created_at  TEXT NOT NULL
            )
        """)
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
                payload            TEXT,
                device_id          TEXT
            )
        """)
        _ensure_column(conn, "scans", "payload", "TEXT")
        _ensure_column(conn, "scans", "title", "TEXT")
        _ensure_column(conn, "scans", "device_id", "TEXT")
        _ensure_column(conn, "scans", "land_id", "INTEGER")


def find_or_create_land(lat, lon, device_id, tolerance=0.001):
    if lat is None or lon is None:
        return None

    with _connect(sqlite3.Row) as conn:
        row = conn.execute("""
            SELECT id FROM lands
            WHERE device_id = ?
              AND ABS(lat - ?) <= ?
              AND ABS(lon - ?) <= ?
            ORDER BY ABS(lat - ?) + ABS(lon - ?) ASC
            LIMIT 1
        """, (device_id, lat, tolerance, lon, tolerance, lat, lon)).fetchone()
        if row:
            return row["id"]

        cursor = conn.execute("""
            INSERT INTO lands (name, lat, lon, device_id, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (None, lat, lon, device_id, datetime.utcnow().isoformat()))
        return cursor.lastrowid


def save_scan(lat, lon, altitude, infected_points, heatmap, env_summary, payload=None, title=None, device_id=None):
    high   = sum(1 for c in heatmap if c["risk"] == "high")
    medium = sum(1 for c in heatmap if c["risk"] == "medium")
    low    = sum(1 for c in heatmap if c["risk"] == "low")
    avg_risk = sum(c["risk_score"] for c in heatmap) / len(heatmap) if heatmap else 0
    land_id = find_or_create_land(lat, lon, device_id)

    if not title:
        title = f"Scan {datetime.now().strftime('%b %d, %I:%M %p')}"

    with _connect() as conn:
        cursor = conn.execute("""
            INSERT INTO scans
            (timestamp, title, lat, lon, altitude, infected_count, avg_risk_score,
            high_cells, medium_cells, low_cells, env_summary, payload, device_id, land_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            datetime.utcnow().isoformat(),
            title,
            lat, lon, altitude,
            len(infected_points),
            round(avg_risk, 4),
            high, medium, low,
            json.dumps(env_summary),
            json.dumps(payload) if payload is not None else None,
            device_id,
            land_id,
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


def get_history(limit=20, device_id=None, include_payload=False):
    with _connect(sqlite3.Row) as conn:
        rows = conn.execute(
            "SELECT * FROM scans WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?",
            (device_id, limit)
        ).fetchall()
        return [_deserialize_scan(row, include_payload=include_payload) for row in rows]


def get_plot_history(
    *,
    lat,
    lon,
    device_id=None,
    limit=20,
    tolerance=0.0001,
    include_payload=False,
    exclude_scan_id=None,
):
    if lat is None or lon is None:
        return get_history(limit=limit, device_id=device_id, include_payload=include_payload)

    query = """
        SELECT *
        FROM scans
        WHERE device_id = ?
          AND ABS(lat - ?) <= ?
          AND ABS(lon - ?) <= ?
    """
    params = [device_id, lat, tolerance, lon, tolerance]

    if exclude_scan_id is not None:
        query += " AND id != ?"
        params.append(exclude_scan_id)

    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    with _connect(sqlite3.Row) as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
        return [_deserialize_scan(row, include_payload=include_payload) for row in rows]


def get_lands(device_id):
    with _connect(sqlite3.Row) as conn:
        rows = conn.execute("""
            SELECT l.*,
                   COUNT(s.id) as scan_count,
                   MAX(s.timestamp) as last_scan_at,
                   (SELECT avg_risk_score FROM scans
                    WHERE land_id = l.id
                    ORDER BY timestamp DESC LIMIT 1) as latest_risk_score,
                   (SELECT infected_count FROM scans
                    WHERE land_id = l.id
                    ORDER BY timestamp DESC LIMIT 1) as latest_infected_count
            FROM lands l
            LEFT JOIN scans s ON s.land_id = l.id
            WHERE l.device_id = ?
            GROUP BY l.id
            ORDER BY last_scan_at DESC
        """, (device_id,)).fetchall()
        return [dict(row) for row in rows]


def get_land(land_id):
    with _connect(sqlite3.Row) as conn:
        row = conn.execute(
            "SELECT * FROM lands WHERE id = ?", (land_id,)
        ).fetchone()
        return dict(row) if row else None


def update_land_name(land_id, name):
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE lands SET name = ? WHERE id = ?", (name, land_id)
        )
        return cursor.rowcount > 0


def delete_land(land_id):
    with _connect() as conn:
        conn.execute("DELETE FROM scans WHERE land_id = ?", (land_id,))
        cursor = conn.execute("DELETE FROM lands WHERE id = ?", (land_id,))
        return cursor.rowcount > 0


def get_scans_by_land(land_id, include_payload=False):
    with _connect(sqlite3.Row) as conn:
        rows = conn.execute("""
            SELECT * FROM scans
            WHERE land_id = ?
            ORDER BY timestamp ASC
        """, (land_id,)).fetchall()
        return [_deserialize_scan(row, include_payload=include_payload) for row in rows]


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
