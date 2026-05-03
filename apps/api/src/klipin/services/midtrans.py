"""Midtrans Snap integration. Uses Midtrans's hosted payment page (redirect_url)
instead of Snap.js — simpler and works without extra frontend integration."""

from __future__ import annotations

import base64
import hashlib
import logging
from dataclasses import dataclass

import httpx

from klipin.config import settings

logger = logging.getLogger(__name__)


class MidtransError(Exception):
    pass


def _api_base() -> str:
    return (
        "https://app.midtrans.com"
        if settings.midtrans_is_production
        else "https://app.sandbox.midtrans.com"
    )


def _auth_header() -> dict[str, str]:
    if not settings.midtrans_server_key:
        raise MidtransError("MIDTRANS_SERVER_KEY not configured")
    token = base64.b64encode(f"{settings.midtrans_server_key}:".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


@dataclass(slots=True)
class CheckoutSession:
    order_id: str
    redirect_url: str
    snap_token: str


async def create_checkout(
    *, order_id: str, amount_idr: int, customer_email: str, customer_name: str = ""
) -> CheckoutSession:
    """Create a Snap transaction. Returns redirect_url to send user to."""
    payload = {
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": amount_idr,
        },
        "credit_card": {"secure": True},
        "customer_details": {
            "first_name": customer_name or customer_email.split("@")[0],
            "email": customer_email,
        },
        "item_details": [
            {
                "id": "klipin-lifetime",
                "price": amount_idr,
                "quantity": 1,
                "name": "Klipin Lifetime Access",
            }
        ],
        "callbacks": {"finish": f"{settings.public_app_url}/payment/success"},
    }

    url = f"{_api_base()}/snap/v1/transactions"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(url, json=payload, headers=_auth_header())
        except httpx.HTTPError as e:
            raise MidtransError(f"network error: {e}") from e

    if r.status_code != 201:
        raise MidtransError(f"Midtrans returned {r.status_code}: {r.text[:300]}")

    data = r.json()
    if "redirect_url" not in data or "token" not in data:
        raise MidtransError(f"unexpected Midtrans response: {data}")

    return CheckoutSession(
        order_id=order_id,
        redirect_url=data["redirect_url"],
        snap_token=data["token"],
    )


def verify_signature(
    *, order_id: str, status_code: str, gross_amount: str, signature_key: str
) -> bool:
    """Verify Midtrans webhook signature.

    Spec: sha512(order_id + status_code + gross_amount + server_key)."""
    if not settings.midtrans_server_key:
        return False
    raw = f"{order_id}{status_code}{gross_amount}{settings.midtrans_server_key}"
    expected = hashlib.sha512(raw.encode()).hexdigest()
    return expected == signature_key
