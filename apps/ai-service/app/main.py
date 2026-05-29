"""掼蛋 AI 微服务入口 — 骨架。

承载 AI Bot 的决策接口：给定可见信息（手牌、桌面顶手、级牌、对手已出张数等），
返回一个合法出牌或 pass。Phase 2 接入规则 AI + Monte Carlo；Phase 4 接入 LLM Agent。
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Teams Guandan AI Service")


class DecideRequest(BaseModel):
    hand: list[str]
    top: list[str] | None = None
    level: str
    difficulty: str = "normal"  # "novice" | "normal" | "hard" | "expert"


class DecideResponse(BaseModel):
    action: str  # "play" | "pass"
    cards: list[str] = []
    rationale: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/decide", response_model=DecideResponse)
def decide(req: DecideRequest) -> DecideResponse:
    # TODO(ai-agent): 接入 strategy interface + simulation engine。
    return DecideResponse(action="pass", rationale="skeleton: not implemented")
