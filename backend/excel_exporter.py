import os
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.drawing.image import Image as OpenpyxlImage
from PIL import Image as PILImage
import io
from typing import Dict, Any

THIN_BORDER = Border(
    left=Side(style='thin', color='D0D5DD'),
    right=Side(style='thin', color='D0D5DD'),
    top=Side(style='thin', color='D0D5DD'),
    bottom=Side(style='thin', color='D0D5DD')
)

THICK_BOTTOM_BORDER = Border(
    bottom=Side(style='medium', color='101828')
)

HEADER_FILL = PatternFill(start_color='F3F4F6', end_color='F3F4F6', fill_type='solid')
SECTION_FILL = PatternFill(start_color='E5E7EB', end_color='E5E7EB', fill_type='solid')


def generate_excel_report(report_data: Dict[str, Any], static_photos_dir: str) -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Flash Report"

    # Set grid lines visible
    ws.views.sheetView[0].showGridLines = True

    # Column widths
    ws.column_dimensions['A'].width = 7.5
    ws.column_dimensions['B'].width = 14.0
    ws.column_dimensions['C'].width = 25.0
    ws.column_dimensions['D'].width = 20.0
    ws.column_dimensions['E'].width = 16.0
    ws.column_dimensions['F'].width = 16.0
    ws.column_dimensions['G'].width = 16.0
    ws.column_dimensions['H'].width = 16.0

    # Row 1: Report Title
    ws.row_dimensions[1].height = 24
    ws['A1'] = "Report:"
    ws['A1'].font = Font(name="Arial", size=11, bold=True, color="111827")
    ws['A1'].alignment = Alignment(vertical="center")

    title_val = report_data.get("title", "")
    ws['B1'] = title_val
    ws['B1'].font = Font(name="Arial", size=11, bold=True, color="1F2937")
    ws['B1'].alignment = Alignment(vertical="center")
    ws.merge_cells('B1:H1')

    # Row 2: System / Equipment Tag & Location
    ws.row_dimensions[2].height = 20
    ws['A2'] = "System / Equipment Tag:"
    ws['A2'].font = Font(name="Arial", size=10, bold=False, color="374151")
    ws['A2'].alignment = Alignment(vertical="center")
    
    ws['C2'] = report_data.get("system_tag", "")
    ws['C2'].font = Font(name="Arial", size=10, bold=True, color="111827")
    ws['C2'].alignment = Alignment(vertical="center")
    ws.merge_cells('C2:D2')

    ws['E2'] = "Location:"
    ws['E2'].font = Font(name="Arial", size=10, bold=False, color="374151")
    ws['E2'].alignment = Alignment(vertical="center")

    ws['F2'] = report_data.get("location", "")
    ws['F2'].font = Font(name="Arial", size=10, bold=True, color="111827")
    ws['F2'].alignment = Alignment(vertical="center")
    ws.merge_cells('F2:H2')

    # Row 3: Inspection Date & Discipline
    ws.row_dimensions[3].height = 20
    ws['A3'] = "Inspection Date:"
    ws['A3'].font = Font(name="Arial", size=10, bold=False, color="374151")
    ws['A3'].alignment = Alignment(vertical="center")

    ws['C3'] = report_data.get("inspection_date", "")
    ws['C3'].font = Font(name="Arial", size=10, bold=True, color="111827")
    ws['C3'].alignment = Alignment(vertical="center")
    ws.merge_cells('C3:D3')

    ws['E3'] = "Discipline:"
    ws['E3'].font = Font(name="Arial", size=10, bold=False, color="374151")
    ws['E3'].alignment = Alignment(vertical="center")

    ws['F3'] = report_data.get("discipline", "")
    ws['F3'].font = Font(name="Arial", size=10, bold=True, color="111827")
    ws['F3'].alignment = Alignment(vertical="center")
    ws.merge_cells('F3:H3')

    # Bottom border for header block
    for col_letter in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']:
        ws[f'{col_letter}3'].border = Border(bottom=Side(style='medium', color='1F2937'))

    # Row 4: Section title: Detail of inspection
    ws.row_dimensions[4].height = 22
    ws['A4'] = "Detail of inspection"
    ws['A4'].font = Font(name="Arial", size=10, bold=True, color="1F2937")
    ws['A4'].alignment = Alignment(horizontal="center", vertical="center")
    ws['A4'].fill = SECTION_FILL
    ws.merge_cells('A4:H4')
    for col_letter in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']:
        ws[f'{col_letter}4'].border = THIN_BORDER

    # Row 5: Column Headers
    ws.row_dimensions[5].height = 24
    headers = [
        ('A5', 'No', 7.5),
        ('B5', 'Tag', 14.0),
        ('C5', 'Inspection Description', 25.0),
        ('D5', 'Note', 20.0),
    ]
    for cell_ref, text, _ in headers:
        cell = ws[cell_ref]
        cell.value = text
        cell.font = Font(name="Arial", size=10, bold=True, color="111827")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.fill = HEADER_FILL
        cell.border = THIN_BORDER

    ws['E5'] = "Illustration"
    ws['E5'].font = Font(name="Arial", size=10, bold=True, color="111827")
    ws['E5'].alignment = Alignment(horizontal="center", vertical="center")
    ws['E5'].fill = HEADER_FILL
    ws.merge_cells('E5:H5')
    for col_letter in ['E', 'F', 'G', 'H']:
        ws[f'{col_letter}5'].border = THIN_BORDER

    # Data Rows
    items = report_data.get("items", [])
    row_idx = 6
    seq_no = 1

    # Keep track of temporary image files to clean up
    temp_images_to_close = []

    for item in items:
        tag = item.get("tag", "").strip() if item.get("tag") else ""
        desc = item.get("description", "").strip() if item.get("description") else ""
        note = item.get("note", "").strip() if item.get("note") else ""
        photos = item.get("photos", [])

        # Only assign auto sequence number if Tag or Description exists
        has_content = bool(tag or desc)
        current_no = seq_no if has_content else ""
        if has_content:
            seq_no += 1

        ws.row_dimensions[row_idx].height = 75.0

        # Col A: No
        ws[f'A{row_idx}'] = current_no
        ws[f'A{row_idx}'].font = Font(name="Arial", size=10, bold=False)
        ws[f'A{row_idx}'].alignment = Alignment(horizontal="center", vertical="center")
        ws[f'A{row_idx}'].border = THIN_BORDER

        # Col B: Tag
        ws[f'B{row_idx}'] = tag
        ws[f'B{row_idx}'].font = Font(name="Arial", size=10, bold=False)
        ws[f'B{row_idx}'].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws[f'B{row_idx}'].border = THIN_BORDER

        # Col C: Description
        ws[f'C{row_idx}'] = desc
        ws[f'C{row_idx}'].font = Font(name="Arial", size=10, bold=False)
        ws[f'C{row_idx}'].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws[f'C{row_idx}'].border = THIN_BORDER

        # Col D: Note
        ws[f'D{row_idx}'] = note
        ws[f'D{row_idx}'].font = Font(name="Arial", size=10, bold=False)
        ws[f'D{row_idx}'].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws[f'D{row_idx}'].border = THIN_BORDER

        # Columns E, F, G, H for up to 4 photos
        photo_cols = ['E', 'F', 'G', 'H']
        for p_idx in range(4):
            col_letter = photo_cols[p_idx]
            cell = ws[f'{col_letter}{row_idx}']
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

            # Check if there is a photo for this slot
            photo_info = None
            if p_idx < len(photos) and photos[p_idx]:
                photo_info = photos[p_idx]

            if photo_info:
                # Find physical photo file
                url = photo_info.get("url", "")
                filename = photo_info.get("filename", "")
                if url.startswith("/api/photos/"):
                    local_filename = url.replace("/api/photos/", "")
                    img_path = os.path.join(static_photos_dir, local_filename)
                elif filename:
                    img_path = os.path.join(static_photos_dir, filename)
                else:
                    img_path = None

                if img_path and os.path.exists(img_path):
                    try:
                        # Open and resize image keeping aspect ratio
                        with PILImage.open(img_path) as pil_img:
                            # Convert RGBA to RGB if needed
                            if pil_img.mode in ("RGBA", "P"):
                                pil_img = pil_img.convert("RGB")

                            # Max dimensions in Excel (points/pixels)
                            max_w, max_h = 105, 90
                            w, h = pil_img.size
                            ratio = min(max_w / w, max_h / h, 1.0)
                            new_w, new_h = int(w * ratio), int(h * ratio)

                            img_bytes = io.BytesIO()
                            pil_img.resize((new_w, new_h), PILImage.Resampling.LANCZOS).save(img_bytes, format="JPEG", quality=85)
                            img_bytes.seek(0)

                            op_img = OpenpyxlImage(img_bytes)
                            op_img.width = new_w
                            op_img.height = new_h
                            
                            # Anchor image to cell
                            ws.add_image(op_img, f'{col_letter}{row_idx}')
                    except Exception as e:
                        print(f"Error embedding image {img_path}: {e}")

        row_idx += 1

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
