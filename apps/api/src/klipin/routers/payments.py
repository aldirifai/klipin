"""Payment endpoints — Midtrans Snap checkout + webhook for lifetime activation."""

from __future__ import annotations

import logging
import secrets
import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klipin.config import settings
from klipin.db import get_session
from klipin.models import Payment, User
from klipin.routers.auth import current_user
from klipin.services import midtrans

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

_SETTLEMENT_STATUSES = {"settlement", "capture"}


class CheckoutOut(BaseModel):
    order_id: str
    redirect_url: str
    amount_idr: int


class WebhookIn(BaseModel):
    order_id: str
    status_code: str
    gross_amount: str
    signature_key: str
    transaction_status: str
    fraud_status: str | None = None


@router.post("/checkout", response_model=CheckoutOut)
async def create_checkout(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> CheckoutOut:
    if user.lifetime_paid_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Akun sudah lifetime aktif")

    order_id = f"klipin-{user.id[:8]}-{int(time.time())}-{secrets.token_hex(3)}"
    amount = settings.lifetime_price_idr

    try:
        session = await midtrans.create_checkout(
            order_id=order_id,
            amount_idr=amount,
            customer_email=user.email,
        )
    except midtrans.MidtransError as e:
        logger.error("midtrans checkout failed: %s", e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Payment gateway error: {e}") from e

    payment = Payment(
        user_id=user.id,
        midtrans_order_id=order_id,
        amount_idr=amount,
        status="pending",
    )
    db.add(payment)
    await db.commit()

    return CheckoutOut(order_id=order_id, redirect_url=session.redirect_url, amount_idr=amount)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(
    payload: WebhookIn,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    """Midtrans server-to-server notification.
    Verifies signature, then activates lifetime if status is settled."""
    valid = midtrans.verify_signature(
        order_id=payload.order_id,
        status_code=payload.status_code,
        gross_amount=payload.gross_amount,
        signature_key=payload.signature_key,
    )
    if not valid:
        logger.warning("invalid webhook signature for order %s", payload.order_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")

    payment = await db.scalar(
        select(Payment).where(Payment.midtrans_order_id == payload.order_id)
    )
    if not payment:
        logger.warning("webhook for unknown order_id %s", payload.order_id)
        return {"status": "unknown_order"}

    is_settled = (
        payload.transaction_status in _SETTLEMENT_STATUSES
        and (payload.fraud_status or "accept") == "accept"
    )

    if is_settled:
        payment.status = "settled"
        user = await db.get(User, payment.user_id)
        if user and not user.lifetime_paid_at:
            user.lifetime_paid_at = datetime.now(UTC)
            user.plan = "lifetime"
            logger.info("activated lifetime for user %s via order %s", user.id, payload.order_id)
    elif payload.transaction_status in {"deny", "cancel", "expire", "failure"}:
        payment.status = payload.transaction_status

    await db.commit()
    return {"status": "ok"}
