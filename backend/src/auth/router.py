import os
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import (LoginRequest, LoginResponse, MeResponse,
                      RenewAccessTokenRequest, RenewAccessTokenResponse,
                      SigninRequest, SigninResponse,
                      UpdateUserDetailsSchemaRequest)
from .services import (get_me_service, login_service, logout_service,
                       renew_access_token_service, revoke_access_token_service,
                       signin_service, update_user_details_service)

router = APIRouter(prefix="/api", tags=["Users"])


bearer_scheme = HTTPBearer()
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")


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


@router.post("/auth/signin", response_model=SigninResponse)
def signin(request: SigninRequest):
    try:
        return signin_service(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest):
    try:
        return login_service(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(id: str):
    try:
        logout_service(id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/tokens/renew", response_model=RenewAccessTokenResponse)
def renew_access_token(request: RenewAccessTokenRequest):
    try:
        return renew_access_token_service(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/tokens/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_access_token(id: str):
    try:
        revoke_access_token_service(id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        if "find" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@router.put("/user_details", status_code=status.HTTP_204_NO_CONTENT)
def add_user_details(
    details: UpdateUserDetailsSchemaRequest,
    current_user_id: dict = Depends(get_current_user),
):
    try:
        update_user_details_service(details, current_user_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        if "only update" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/me", response_model=MeResponse)
def get_me(current_user_id: UUID = Depends(get_current_user)):
    try:
        return get_me_service(current_user_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
