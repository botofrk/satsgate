from __future__ import annotations

from dataclasses import asdict, dataclass
from math import ceil


@dataclass(frozen=True)
class Plan:
    id: str
    title: str
    price_sats: int
    credits: int
    note: str = ""

    def to_dict(self) -> dict:
        data = asdict(self)
        data["name"] = self.title
        data["description"] = self.note
        return data


# Simplified plans — 3 tiers, no credit card required.
# - Trial: cheap entry for testing the L402 flow
# - Value: best for production — biggest discount per credit
# - Pro: for high-volume operators who want fewer top-ups
#
# 1 credit = 1 successful /v1/paywall/verify. Credits do not expire.
PLANS: dict[str, Plan] = {
    "trial": Plan(
        id="trial",
        title="Trial",
        price_sats=1_000,
        credits=200,
        note="Try the L402 flow. ~5 sats per verify.",
    ),
    "value": Plan(
        id="value",
        title="Value",
        price_sats=25_000,
        credits=10_000,
        note="Best value. 2.5 sats per verify — 50% cheaper than Trial.",
    ),
    "pro": Plan(
        id="pro",
        title="Pro",
        price_sats=250_000,
        credits=150_000,
        note="High volume. 1.67 sats per verify — fewer top-ups.",
    ),
}


def list_plans() -> list[dict]:
    return [p.to_dict() for p in PLANS.values()]


def get_plan(plan_id: str) -> Plan:
    plan_id = (plan_id or "").strip().lower()
    if plan_id not in PLANS:
        raise KeyError(f"invalid plan: {plan_id}")
    return PLANS[plan_id]


def recommend_purchase(
    additional_credits_needed: int,
    *,
    max_topups: int = 3,
) -> dict | None:
    """Recommend what to buy to cover `additional_credits_needed`.

    - Supports buying multiples of the same plan (quantity).
    - Preference: minimize total sats.
    - If there are options with `quantity <= max_topups`, choose among those (reduces friction).

    Returns a dict:
      {plan_id, quantity, sats_total, credits_total, credits_over_need, plan}
    """

    additional_credits_needed = int(additional_credits_needed)
    if additional_credits_needed <= 0:
        return None

    max_topups = max(1, min(int(max_topups), 50))

    options: list[dict] = []
    for plan in PLANS.values():
        if int(plan.credits) <= 0:
            continue
        q = int(ceil(additional_credits_needed / float(plan.credits)))
        sats_total = int(plan.price_sats) * q
        credits_total = int(plan.credits) * q
        options.append(
            {
                "plan_id": plan.id,
                "quantity": q,
                "sats_total": sats_total,
                "credits_total": credits_total,
                "credits_over_need": credits_total - additional_credits_needed,
                "plan": plan.to_dict(),
            }
        )

    if not options:
        return None

    candidates = [o for o in options if o["quantity"] <= max_topups]
    if not candidates:
        candidates = options

    # Cheapest first; tie-break: fewer top-ups; then least overshoot
    candidates.sort(key=lambda o: (o["sats_total"], o["quantity"], o["credits_over_need"]))

    return candidates[0]
