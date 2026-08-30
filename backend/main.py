import os
import uuid
import re
import base64
import io
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from PIL import Image as PILImage

from database import (
    init_db, get_all_reports, get_report_by_id,
    create_report, update_report, delete_report,
    DB_DIR, PHOTOS_DIR
)
from models import ReportModel, ReportSummary
from excel_exporter import generate_excel_report
from pdf_exporter import generate_pdf_report

app = FastAPI(title="Flash Report System", version="1.0.0")

# Enable CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB
init_db()

# Mount uploaded photos
app.mount("/api/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", name).strip()
    return cleaned if cleaned else "Flash_Report"


@app.get("/api/reports")
def list_reports():
    reports = get_all_reports()
    return {"reports": reports}


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.post("/api/reports")
def create_new_report(data: Optional[Dict[str, Any]] = None):
    report_id = str(uuid.uuid4())
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Default sample empty report with 4 blank rows
    initial_items = [
        {"id": f"{report_id}_item_1", "tag": "", "description": "", "note": "", "photos": []},
        {"id": f"{report_id}_item_2", "tag": "", "description": "", "note": "", "photos": []},
        {"id": f"{report_id}_item_3", "tag": "", "description": "", "note": "", "photos": []},
        {"id": f"{report_id}_item_4", "tag": "", "description": "", "note": "", "photos": []},
    ]

    report_payload = {
        "id": report_id,
        "title": "New Flash Report",
        "system_tag": "",
        "location": "",
        "inspection_date": today,
        "discipline": "Mechanical",
        "items": initial_items
    }

    if data:
        report_payload.update({k: v for k, v in data.items() if k != "id"})
        if "items" in data:
            report_payload["items"] = data["items"]

    created = create_report(report_payload)
    return created


@app.put("/api/reports/{report_id}")
def save_report(report_id: str, report_data: Dict[str, Any]):
    existing = get_report_by_id(report_id)
    if not existing:
        # Create if not exists
        report_data["id"] = report_id
        return create_report(report_data)
    updated = update_report(report_id, report_data)
    return updated


@app.delete("/api/reports/{report_id}")
def remove_report(report_id: str):
    success = delete_report(report_id)
    if not success:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"message": "Report deleted successfully"}


@app.post("/api/reports/{report_id}/duplicate")
def duplicate_report(report_id: str):
    original = get_report_by_id(report_id)
    if not original:
        raise HTTPException(status_code=404, detail="Original report not found")
    
    new_id = str(uuid.uuid4())
    duplicated_data = {
        "id": new_id,
        "title": f"Copy of {original.get('title', 'Report')}",
        "system_tag": original.get("system_tag", ""),
        "location": original.get("location", ""),
        "inspection_date": datetime.now().strftime("%Y-%m-%d"),
        "discipline": original.get("discipline", ""),
        "items": []
    }

    for idx, item in enumerate(original.get("items", [])):
        duplicated_data["items"].append({
            "id": f"{new_id}_item_{idx+1}",
            "tag": item.get("tag", ""),
            "description": item.get("description", ""),
            "note": item.get("note", ""),
            "photos": item.get("photos", [])
        })

    created = create_report(duplicated_data)
    return created


@app.post("/api/upload-photo")
async def upload_photo(
    file: Optional[UploadFile] = File(None),
    base64_data: Optional[str] = Form(None)
):
    try:
        photo_id = str(uuid.uuid4())
        filename = f"{photo_id}.jpg"
        file_path = os.path.join(PHOTOS_DIR, filename)

        if file:
            contents = await file.read()
            img = PILImage.open(io.BytesIO(contents))
        elif base64_data:
            # Handle data:image/png;base64,...
            if "," in base64_data:
                base64_data = base64_data.split(",", 1)[1]
            decoded = base64.b64decode(base64_data)
            img = PILImage.open(io.BytesIO(decoded))
        else:
            raise HTTPException(status_code=400, detail="No image file or base64 data provided")

        # Convert to RGB and optimize
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # Max resolution resize to optimize storage and export speed
        max_dim = 1600
        if max(img.size) > max_dim:
            img.thumbnail((max_dim, max_dim), PILImage.Resampling.LANCZOS)

        img.save(file_path, "JPEG", quality=85, optimize=True)

        return {
            "id": photo_id,
            "filename": filename,
            "url": f"/api/photos/{filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")


@app.get("/api/reports/{report_id}/export/excel")
def export_excel(report_id: str):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    excel_stream = generate_excel_report(report, PHOTOS_DIR)
    
    title = sanitize_filename(report.get("title", "Flash_Report"))
    date_str = report.get("inspection_date", "").replace("-", "")
    if not date_str:
        date_str = datetime.now().strftime("%Y%m%d")
    
    filename = f"{title}_{date_str}.xlsx"

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/reports/{report_id}/export/pdf")
def export_pdf(report_id: str):
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    pdf_stream = generate_pdf_report(report, PHOTOS_DIR)
    
    title = sanitize_filename(report.get("title", "Flash_Report"))
    date_str = report.get("inspection_date", "").replace("-", "")
    if not date_str:
        date_str = datetime.now().strftime("%Y%m%d")
    
    filename = f"{title}_{date_str}.pdf"

    return StreamingResponse(
        pdf_stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# Mount built frontend if available
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
