import sqlite3, os, json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT NOT NULL,
                lat         REAL,
                lon         REAL,
                altitude    REAL,
                infected_count     INTEGER,
                avg_risk_score     REAL,
                high_cells         INTEGER,
                medium_cells       INTEGER,
                low_cells          INTEGER,
                env_summary        TEXT   -- JSON string
            )
        """)

def save_scan(lat, lon, altitude, infected_points, heatmap, env_summary):
    high   = sum(1 for c in heatmap if c["risk"] == "high")
    medium = sum(1 for c in heatmap if c["risk"] == "medium")
    low    = sum(1 for c in heatmap if c["risk"] == "low")
    avg_risk = sum(c["risk_score"] for c in heatmap) / len(heatmap) if heatmap else 0

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO scans
            (timestamp, lat, lon, altitude, infected_count, avg_risk_score,
             high_cells, medium_cells, low_cells, env_summary)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            datetime.utcnow().isoformat(),
            lat, lon, altitude,
            len(infected_points),
            round(avg_risk, 4),
            high, medium, low,
            json.dumps(env_summary)
        ))

def get_history(limit=20):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM scans ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]