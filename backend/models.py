from pydantic import BaseModel, Field
from typing import List, Optional, Any


class PhotoItem(BaseModel):
    id: Optional[str] = None
    url: str
    filename: Optional[str] = None
    slot_index: Optional[int] = 0


class InspectionItemModel(BaseModel):
    id: Optional[str] = None
    tag: Optional[str] = ""
    description: Optional[str] = ""
    note: Optional[str] = ""
    photos: List[Optional[PhotoItem]] = Field(default_factory=list)


class ReportModel(BaseModel):
    id: str
    title: str = "Untitled Flash Report"
    system_tag: Optional[str] = ""
    location: Optional[str] = ""
    inspection_date: Optional[str] = ""
    discipline: Optional[str] = ""
    items: List[InspectionItemModel] = Field(default_factory=list)


class ReportSummary(BaseModel):
    id: str
    title: str
    system_tag: Optional[str] = ""
    location: Optional[str] = ""
    inspection_date: Optional[str] = ""
    discipline: Optional[str] = ""
    item_count: int = 0
    created_at: str
    updated_at: str
