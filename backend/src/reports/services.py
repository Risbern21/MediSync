import base64
import json
import os
import urllib.parse
from uuid import UUID, uuid4

from bson import Binary
from fastapi import HTTPException, UploadFile, status
from openai import OpenAI

from db.db import get_db
from storage.storage import download_bytes, upload_bytes
from utils.ocr import extract_text_from_bytes

from .schemas import (ReportCreateSchema, ReportInDBSchema,
                      ReportResponseSchema, ReportStatus, ReportUpdateSchema)

S3_BUCKET = os.getenv("S3_BUCKET_NAME")
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
COLLECTION = "reports"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1/")
# ---------- helpers -----------------------------------------------------------


def _uuid_to_bin(uid: UUID) -> Binary:
    return Binary(uid.bytes, 3)


def _bin_to_uuid(val) -> UUID:
    if isinstance(val, (bytes, Binary)):
        raw = bytes(val)
        if len(raw) == 16:
            return UUID(bytes=raw)
        return UUID(raw.decode("ascii"))
    return UUID(str(val))


def _doc_to_response(doc: dict) -> ReportResponseSchema:
    file_data = None
    if doc.get("url"):
        try:
            parsed = urllib.parse.urlparse(doc["url"])
            s3_key = parsed.path.lstrip("/")
            bucket = parsed.netloc
            raw_bytes = download_bytes(s3_key, bucket)
            file_data = base64.b64encode(raw_bytes).decode("utf-8")
        except Exception as e:
            print(f"Error fetching file for report {_bin_to_uuid(doc['_id'])}: {e}")

    return ReportResponseSchema(
        id=_bin_to_uuid(doc["_id"]),
        patient_id=_bin_to_uuid(doc["patient_id"]),
        patient_name=doc["patient_name"],
        url=doc.get("url"),
        file_data=file_data,
        tests=doc.get("tests"),
        doctor=doc.get("doctor"),
        lab_no=doc.get("lab_no"),
        status=doc["status"],
        created_at=doc["created_at"],
    )


async def _upload_to_s3(file: UploadFile, folder: str = "reports") -> tuple[str, bytes]:
    """Upload to S3 and return (url, raw_bytes). Reads file only once."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{file.content_type}' not allowed. Use PDF or image.",
        )
    file_bytes = await file.read()
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    s3_key = f"{folder}/{uuid4()}.{ext}"
    try:
        url = upload_bytes(
            data=file_bytes,
            s3_key=s3_key,
            bucket=S3_BUCKET,
            content_type=file.content_type,
        )
        return url, file_bytes
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 upload failed: {str(e)}",
        )


def _extract_and_update(report_id: UUID, file_bytes: bytes, media_type: str) -> None:
    """
    Background task:
    1. Extract raw text via OCR.
    2. Parse raw text into structured JSON via Groq (Llama).
    3. Update the MongoDB document with the results.
    """

    # --- STAGE 1: OCR Extraction via Document AI ---
    try:
        # Uses the logic defined in ocr.py to get raw text
        raw_text = extract_text_from_bytes(file_bytes, media_type)
        if not raw_text:
            raise ValueError("No text extracted from document.")
    except Exception as e:
        print(f"[OCR Error] Document AI failed for report {report_id}: {e}")
        raw_text = ""

    # --- STAGE 2: Structured Parsing via Groq (Llama) ---
    extracted = {"doctor": None, "lab_no": None, "tests": []}

    if raw_text:
        try:

            prompt = (
                "You are a medical data extraction assistant. "
                "The following text is OCR output from a lab report. "
                "Extract these fields and return ONLY a valid JSON object:\n"
                "- doctor: name of the ordering/signing doctor (string)\n"
                "- lab_no: lab or report reference number (string)\n"
                "- tests: array of objects with: name, result, unit, reference_range\n\n"
                f"OCR TEXT:\n{raw_text}"
            )

            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {
                        "role": "system",
                        "content": prompt,
                    },
                    {"role": "user", "content": f"Parse this report:\n\n{raw_text}"},
                ],
                response_format={"type": "json_object"},  # enforces JSON output
                temperature=0,  # deterministic for parsing
            )

            extracted = json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"[AI Error] Groq parsing failed for report {report_id}: {e}")

    # --- STAGE 3: Database Update ---
    try:
        db = get_db()
        db[COLLECTION].update_one(
            {"_id": _uuid_to_bin(report_id)},
            {
                "$set": {
                    "doctor": extracted.get("doctor"),
                    "lab_no": extracted.get("lab_no"),
                    "tests": extracted.get("tests") or [],
                    # Move status to PENDING so the UI knows extraction is finished
                    "status": ReportStatus.PENDING.value,
                }
            },
        )
    except Exception as e:
        print(f"[DB Error] Final update failed for report {report_id}: {e}")


# ---------- services ----------------------------------------------------------


async def add_report_service(
    payload: ReportCreateSchema,
    file: UploadFile,
    current_user_id: UUID,
) -> tuple[ReportResponseSchema, bytes, str]:
    """
    Upload the file, insert a minimal PROCESSING record, and return
    (response, file_bytes, media_type) so the router can schedule extraction.
    """
    s3_url, file_bytes = await _upload_to_s3(file)
    media_type = file.content_type

    db_doc = ReportInDBSchema(**payload.model_dump(), url=s3_url)
    document = db_doc.model_dump()
    document["_id"] = _uuid_to_bin(db_doc.id)
    document["patient_id"] = _uuid_to_bin(db_doc.patient_id)
    del document["id"]

    db = get_db()
    db[COLLECTION].insert_one(document)

    response = ReportResponseSchema(**db_doc.model_dump())
    return response, file_bytes, media_type


def get_report_by_id_service(
    report_id: UUID,
    current_user_id: UUID,
) -> ReportResponseSchema:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(report_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    return _doc_to_response(doc)


def get_all_my_reports_service(
    current_user_id: UUID,
    report_status: ReportStatus | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[ReportResponseSchema]:
    db = get_db()
    query = {"patient_id": _uuid_to_bin(current_user_id)}
    if report_status:
        query["status"] = report_status.value

    docs = db[COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit)
    return [_doc_to_response(doc) for doc in docs]


def update_report_service(
    report_id: UUID,
    payload: ReportUpdateSchema,
    current_user_id: UUID,
) -> ReportResponseSchema:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(report_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    updates = payload.model_dump(exclude_unset=True, exclude={"url"})
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update."
        )

    db[COLLECTION].update_one(
        {"_id": _uuid_to_bin(report_id)},
        {"$set": updates},
    )

    updated = db[COLLECTION].find_one({"_id": _uuid_to_bin(report_id)})
    return _doc_to_response(updated)


def delete_report_service(
    report_id: UUID,
    current_user_id: UUID,
) -> dict:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(report_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    db[COLLECTION].delete_one({"_id": _uuid_to_bin(report_id)})
    return {"detail": "Report deleted successfully."}
