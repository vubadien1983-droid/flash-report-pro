import sqlite3
import os
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DB_DIR, "flash_reports.db")
PHOTOS_DIR = os.path.join(DB_DIR, "photos")

os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(PHOTOS_DIR, exist_ok=True)


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled Flash Report',
                system_tag TEXT DEFAULT '',
                location TEXT DEFAULT '',
                inspection_date TEXT DEFAULT '',
                discipline TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS inspection_items (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL,
                item_order INTEGER NOT NULL,
                tag TEXT DEFAULT '',
                description TEXT DEFAULT '',
                note TEXT DEFAULT '',
                photos TEXT DEFAULT '[]',
                FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_items_report_id ON inspection_items(report_id)")
        conn.commit()


def get_all_reports() -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.*, COUNT(i.id) as item_count
            FROM reports r
            LEFT JOIN inspection_items i ON r.id = i.report_id
            GROUP BY r.id
            ORDER BY r.updated_at DESC
        """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_report_by_id(report_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
        report_row = cursor.fetchone()
        if not report_row:
            return None

        report = dict(report_row)
        cursor.execute(
            "SELECT * FROM inspection_items WHERE report_id = ? ORDER BY item_order ASC",
            (report_id,)
        )
        item_rows = cursor.fetchall()
        items = []
        for r in item_rows:
            item_dict = dict(r)
            try:
                item_dict["photos"] = json.loads(item_dict["photos"]) if item_dict["photos"] else []
            except Exception:
                item_dict["photos"] = []
            items.append(item_dict)

        report["items"] = items
        return report


def create_report(report_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        report_id = report_data["id"]

        cursor.execute("""
            INSERT INTO reports (id, title, system_tag, location, inspection_date, discipline, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            report_id,
            report_data.get("title", "Untitled Flash Report"),
            report_data.get("system_tag", ""),
            report_data.get("location", ""),
            report_data.get("inspection_date", datetime.now().strftime("%Y-%m-%d")),
            report_data.get("discipline", ""),
            now,
            now
        ))

        items = report_data.get("items", [])
        for idx, item in enumerate(items):
            item_id = item.get("id", f"{report_id}_item_{idx+1}")
            photos_json = json.dumps(item.get("photos", []))
            cursor.execute("""
                INSERT INTO inspection_items (id, report_id, item_order, tag, description, note, photos)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                item_id,
                report_id,
                idx,
                item.get("tag", ""),
                item.get("description", ""),
                item.get("note", ""),
                photos_json
            ))

        conn.commit()
    return get_report_by_id(report_id)


def update_report(report_id: str, report_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()

        cursor.execute("""
            UPDATE reports
            SET title = ?, system_tag = ?, location = ?, inspection_date = ?, discipline = ?, updated_at = ?
            WHERE id = ?
        """, (
            report_data.get("title", "Untitled Flash Report"),
            report_data.get("system_tag", ""),
            report_data.get("location", ""),
            report_data.get("inspection_date", ""),
            report_data.get("discipline", ""),
            now,
            report_id
        ))

        # Replace items
        cursor.execute("DELETE FROM inspection_items WHERE report_id = ?", (report_id,))
        items = report_data.get("items", [])
        for idx, item in enumerate(items):
            item_id = item.get("id", f"{report_id}_item_{idx+1}")
            photos_json = json.dumps(item.get("photos", []))
            cursor.execute("""
                INSERT INTO inspection_items (id, report_id, item_order, tag, description, note, photos)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                item_id,
                report_id,
                idx,
                item.get("tag", ""),
                item.get("description", ""),
                item.get("note", ""),
                photos_json
            ))

        conn.commit()
    return get_report_by_id(report_id)


def delete_report(report_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM inspection_items WHERE report_id = ?", (report_id,))
        cursor.execute("DELETE FROM reports WHERE id = ?", (report_id,))
        conn.commit()
        return cursor.rowcount > 0
