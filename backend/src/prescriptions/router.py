import json
import os
import urllib.parse
from typing import Optional
from uuid import UUID

import jwt
from fastapi import (APIRouter, Depends, File, Form, HTTPException, Query,
                     UploadFile, status)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db.db import get_db
from storage.storage import download_bytes
from utils.ocr import extract_text_from_bytes

from .schemas import (MedicineSchema, PrescriptionCreateSchema,
                      PrescriptionResponseSchema, PrescriptionStatus,
                      PrescriptionUpdateSchema)
from .services import (_bin_to_uuid, _uuid_to_bin, add_prescription_service,
                       delete_prescription_service,
                       get_all_my_prescriptions_service,
                       get_prescription_by_id_service,
                       update_prescription_service)

# ── JWT dependency ───────────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")

COLLECTION = "prescriptions"

# Map file extensions / content-types stored in the S3 URL to MIME types
_EXT_TO_MIME = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UUID:
    """
    Decode the Bearer JWT and return the user's UUID (maps to patient_id).
    Raises 401 if the token is missing, expired, or invalid.
    """
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("No subject in token.")
        return UUID(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Router ───────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/prescriptions", tags=["Prescriptions"])


# POST /api/prescriptions/add
@router.post(
    "/add",
    response_model=PrescriptionResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new prescription with an attached file",
)
async def add_prescription(
    patient_id: str = Form(..., description="UUID of the patient"),
    patient_name: str = Form(...),
    disease_date: str = Form(..., description="Format: YYYY-MM-DD"),
    medications: str = Form(
        ..., description='JSON array: [{"name":"...","dose":"...","frequency":"..."}]'
    ),
    doctors_remark: Optional[str] = Form(None),
    prescription_status: str = Form("new"),
    file: UploadFile = File(..., description="Prescription image or PDF"),
    current_user: UUID = Depends(get_current_user),
):
    """
    Upload a prescription along with its supporting document.
    The file is stored in S3; the resulting URL is saved in MongoDB.
    """
    try:
        meds = [MedicineSchema(**m) for m in json.loads(medications)]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'medications' must be a valid JSON array.",
        )

    payload = PrescriptionCreateSchema(
        patient_id=UUID(patient_id),
        patient_name=patient_name,
        disease_date=disease_date,
        medications=meds,
        doctors_remark=doctors_remark,
        status=PrescriptionStatus(prescription_status),
    )

    return await add_prescription_service(payload, file, current_user)


# GET /api/prescriptions/{prescription_id}/evaluate
@router.get(
    "/{prescription_id}/evaluate",
    summary="Run OCR on the prescription file stored in S3",
    response_description="Extracted text from the prescription image / PDF",
)
async def evaluate_prescription(
    prescription_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """
    1. Fetch the prescription record from MongoDB (ownership-checked).
    2. Download the raw file bytes from S3 using the stored URL.
    3. Pass the bytes to Google Document AI for OCR.
    4. Return the extracted text.
    """
    # ── 1. Look up the prescription ──────────────────────────────────────────
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(prescription_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prescription not found.",
        )

    if _bin_to_uuid(doc["patient_id"]) != current_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    s3_url: str = doc.get("url", "")
    if not s3_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file is attached to this prescription.",
        )

    # ── 2. Download file bytes from S3 ───────────────────────────────────────
    try:
        parsed = urllib.parse.urlparse(s3_url)
        s3_key = parsed.path.lstrip("/")
        bucket = parsed.netloc
        file_bytes = download_bytes(s3_key, bucket)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to download file from S3: {exc}",
        )

    # ── 3. Detect MIME type from the S3 key extension ────────────────────────
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else "pdf"
    mime_type = _EXT_TO_MIME.get(ext, "application/pdf")

    # ── 4. Run OCR via Google Document AI ───────────────────────────────────
    try:
        extracted_text = extract_text_from_bytes(file_bytes, mime_type=mime_type)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    return {
        "prescription_id": str(prescription_id),
        "mime_type": mime_type,
        "extracted_text": extracted_text,
    }


# GET /api/prescriptions/{prescription_id}
@router.get(
    "/{prescription_id}",
    response_model=PrescriptionResponseSchema,
    summary="Get a single prescription by ID",
)
async def get_prescription_by_id(
    prescription_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Fetch one prescription. Returns 403 if it does not belong to the requesting user."""
    return get_prescription_by_id_service(prescription_id, current_user)


# GET /api/prescriptions/
@router.get(
    "/",
    response_model=list[PrescriptionResponseSchema],
    summary="Get all prescriptions for the authenticated user",
)
async def get_all_my_prescriptions(
    prescription_status: Optional[PrescriptionStatus] = Query(
        None,
        alias="status",
        description="Filter by status: active | expired | new",
    ),
    skip: int = Query(0, ge=0, description="Records to skip (pagination)"),
    limit: int = Query(20, ge=1, le=100, description="Max records to return"),
    current_user: UUID = Depends(get_current_user),
):
    """
    Returns all prescriptions whose patient_id matches the JWT user.
    Supports optional ?status= filter and skip/limit pagination.
    """
    return get_all_my_prescriptions_service(
        current_user, prescription_status, skip, limit
    )


# PUT /api/prescriptions/update/{prescription_id}
@router.put(
    "/update/{prescription_id}",
    response_model=PrescriptionResponseSchema,
    summary="Update a prescription (file/URL cannot be changed)",
)
async def update_prescription(
    prescription_id: UUID,
    payload: PrescriptionUpdateSchema,
    current_user: UUID = Depends(get_current_user),
):
    """
    Update editable fields of a prescription.
    The prescription file stored in S3 cannot be replaced via this endpoint.
    """
    return update_prescription_service(prescription_id, payload, current_user)


# DELETE /api/prescriptions/delete/{prescription_id}
@router.delete(
    "/delete/{prescription_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a prescription by ID",
)
async def delete_prescription(
    prescription_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Hard-delete a prescription. Only the owning patient can delete their own records."""
    return delete_prescription_service(prescription_id, current_user)
