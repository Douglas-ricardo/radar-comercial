# app/main.py
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from app.api import files, insights, auth, team, customers, billing, account, integrations, notifications, carteira
from app.core.rate_limit import limiter

app = FastAPI(
    title="Radar Comercial API",
    description="API B2B de inteligência comercial com ML e processamento distribuído",
    version="1.0.0"
)

# Rate limiter global — instala state e handler para 429
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — origens vêm de ALLOWED_ORIGINS (separadas por vírgula); fallback para localhost.
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allow_origins = [origin.strip() for origin in _allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrando roteadores
app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(files.router)
app.include_router(insights.router)
app.include_router(team.router)
app.include_router(customers.router)
app.include_router(account.users_router)
app.include_router(account.company_router)
app.include_router(integrations.router)
app.include_router(integrations.ingest_router)
app.include_router(notifications.router)
app.include_router(carteira.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Radar Comercial API"}