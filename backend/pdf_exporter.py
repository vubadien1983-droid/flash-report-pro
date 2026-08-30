import os
import io
from typing import Dict, Any
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, Image as RLImage, KeepTogether
)
from reportlab.pdfgen import canvas
from PIL import Image as PILImage


class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#6B7280"))
        
        # Header line on pages > 1
        if self._pageNumber > 1:
            self.setStrokeColor(colors.HexColor("#E5E7EB"))
            self.setLineWidth(0.5)
            self.line(36, 560, 806, 560)
            self.drawString(36, 565, "BLOCK B - EPC#1 | FLASH INSPECTION REPORT")

        # Footer
        self.setStrokeColor(colors.HexColor("#E5E7EB"))
        self.setLineWidth(0.5)
        self.line(36, 35, 806, 35)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(806, 22, page_str)
        self.drawString(36, 22, "Block B - EPC#1 Project | Confidential & Proprietary")
        self.restoreState()


def generate_pdf_report(report_data: Dict[str, Any], static_photos_dir: str) -> io.BytesIO:
    buffer = io.BytesIO()
    
    # Page setup: Landscape A4 (841.89 x 595.27 pt)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'MainTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#111827")
    )

    label_style = ParagraphStyle(
        'FieldLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#374151")
    )

    value_style = ParagraphStyle(
        'FieldValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#111827")
    )

    tbl_header_style = ParagraphStyle(
        'TblHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        alignment=1, # Center
        textColor=colors.HexColor("#111827")
    )

    cell_center_style = ParagraphStyle(
        'CellCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=10.5,
        alignment=1, # Center
        textColor=colors.HexColor("#1F2937")
    )

    cell_left_style = ParagraphStyle(
        'CellLeft',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=10.5,
        alignment=0, # Left
        textColor=colors.HexColor("#1F2937")
    )

    story = []

    # 1. Header Metadata Table
    report_title = report_data.get("title", "Untitled Flash Report")
    system_tag = report_data.get("system_tag", "")
    location = report_data.get("location", "")
    insp_date = report_data.get("inspection_date", "")
    discipline = report_data.get("discipline", "")

    header_table_data = [
        [
            Paragraph("Report:", label_style),
            Paragraph(f"<b>{report_title}</b>", title_style),
            "", "", "", "", "", ""
        ],
        [
            Paragraph("System / Equipment Tag:", label_style),
            Paragraph(f"<b>{system_tag}</b>", value_style),
            "", "",
            Paragraph("Location:", label_style),
            Paragraph(f"<b>{location}</b>", value_style),
            "", ""
        ],
        [
            Paragraph("Inspection Date:", label_style),
            Paragraph(f"<b>{insp_date}</b>", value_style),
            "", "",
            Paragraph("Discipline:", label_style),
            Paragraph(f"<b>{discipline}</b>", value_style),
            "", ""
        ]
    ]

    header_col_widths = [140, 140, 105, 55, 90, 80, 80, 80]
    header_table = Table(header_table_data, colWidths=header_col_widths)
    header_table.setStyle(TableStyle([
        ('SPAN', (1, 0), (7, 0)),
        ('SPAN', (1, 1), (3, 1)),
        ('SPAN', (5, 1), (7, 1)),
        ('SPAN', (1, 2), (3, 2)),
        ('SPAN', (5, 2), (7, 2)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 2), (7, 2), 1.2, colors.HexColor("#1F2937")),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))

    # 2. Section Header: "Detail of inspection"
    section_data = [[Paragraph("<b>Detail of inspection</b>", cell_center_style)]]
    section_table = Table(section_data, colWidths=[770])
    section_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#E5E7EB")),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#9CA3AF")),
    ]))
    story.append(section_table)

    # 3. Main Inspection Items Table
    col_widths = [35, 75, 180, 140, 85, 85, 85, 85] # Total 770 pt

    table_data = [
        [
            Paragraph("<b>No</b>", tbl_header_style),
            Paragraph("<b>Tag</b>", tbl_header_style),
            Paragraph("<b>Inspection Description</b>", tbl_header_style),
            Paragraph("<b>Note</b>", tbl_header_style),
            Paragraph("<b>Illustration</b>", tbl_header_style),
            "", "", ""
        ]
    ]

    items = report_data.get("items", [])
    seq_no = 1

    for item in items:
        tag = item.get("tag", "").strip() if item.get("tag") else ""
        desc = item.get("description", "").strip() if item.get("description") else ""
        note = item.get("note", "").strip() if item.get("note") else ""
        photos = item.get("photos", [])

        has_content = bool(tag or desc)
        no_text = str(seq_no) if has_content else ""
        if has_content:
            seq_no += 1

        photo_cells = []
        for p_idx in range(4):
            photo_info = photos[p_idx] if p_idx < len(photos) and photos[p_idx] else None
            cell_element = ""
            if photo_info:
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
                        # Process image thumbnail for PDF
                        with PILImage.open(img_path) as pil_img:
                            if pil_img.mode in ("RGBA", "P"):
                                pil_img = pil_img.convert("RGB")
                            max_w, max_h = 78, 62
                            w, h = pil_img.size
                            ratio = min(max_w / w, max_h / h, 1.0)
                            new_w, new_h = max(int(w * ratio), 10), max(int(h * ratio), 10)
                            
                            img_io = io.BytesIO()
                            pil_img.save(img_io, format="JPEG", quality=85)
                            img_io.seek(0)
                            rl_img = RLImage(img_io, width=new_w, height=new_h)
                            cell_element = rl_img
                    except Exception as e:
                        print(f"PDF Image load error: {e}")
            photo_cells.append(cell_element)

        table_data.append([
            Paragraph(no_text, cell_center_style),
            Paragraph(tag, cell_center_style),
            Paragraph(desc, cell_left_style),
            Paragraph(note, cell_left_style),
            photo_cells[0],
            photo_cells[1],
            photo_cells[2],
            photo_cells[3]
        ])

    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    t_style = [
        ('SPAN', (4, 0), (7, 0)),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]

    # Center align photo cells
    for r in range(1, len(table_data)):
        t_style.append(('ALIGN', (4, r), (7, r), 'CENTER'))
        t_style.append(('VALIGN', (4, r), (7, r), 'MIDDLE'))

    main_table.setStyle(TableStyle(t_style))
    story.append(main_table)

    # Build document with page numbers
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
