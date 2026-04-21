import os

from google.cloud import documentai

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
PROCESSOR_ID = os.getenv("PROCESSOR_ID")
LOCATION = os.getenv("GCP_LOCATION", "us")


def get_document_ai_client() -> documentai.DocumentProcessorServiceClient:
    """Return a Document AI client. Credentials are picked up automatically
    from the GOOGLE_APPLICATION_CREDENTIALS env var or the GCP metadata server."""
    return documentai.DocumentProcessorServiceClient()


def check_processor():
    client = get_document_ai_client()
    processor_name = client.processor_path(PROJECT_ID, LOCATION, PROCESSOR_ID)
    processor = client.get_processor(name=processor_name)
    print(f"Type: {processor.type_}")
    print(f"State: {processor.state}")
    print(f"Name: {processor.display_name}")


def extract_text_from_bytes(
    file_bytes: bytes, mime_type: str = "application/pdf"
) -> str:
    """
    Send raw file bytes to Google Document AI and return the extracted text.

    Args:
        file_bytes: Raw bytes of the prescription file (PDF or image).
        mime_type:  MIME type of the file, e.g. "application/pdf",
                    "image/jpeg", "image/png", "image/webp".

    Returns:
        The full text extracted from the document.

    Raises:
        RuntimeError: If the Document AI call fails.
    """
    check_processor()

    client = get_document_ai_client()
    processor_name = client.processor_path(PROJECT_ID, LOCATION, PROCESSOR_ID)

    raw_document = documentai.RawDocument(
        content=file_bytes,
        mime_type=mime_type,
    )

    request = documentai.ProcessRequest(
        name=processor_name,
        raw_document=raw_document,
    )

    try:
        result = client.process_document(request=request)
    except Exception as exc:
        raise RuntimeError(f"Document AI processing failed: {exc}") from exc

    return result.document.text or ""
