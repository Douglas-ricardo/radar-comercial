# app/main.py
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from app.api import files, insights, auth, team, customers, billing, account, integrations, notifications, carteira, opportunities, outreach, reports
from app.core.rate_limit import limiter
from app.core.observability import configure_logging, init_sentry

# Observabilidade antes de criar o app (degrada sem SENTRY_DSN).
configure_logging()
init_sentry()

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


# Security headers em todas as respostas. HSTS só quando em produção (HTTPS),
# controlado pela mesma flag do cookie seguro.
_HSTS = os.getenv("COOKIE_SECURE", "false").lower() == "true"


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if _HSTS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

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
app.include_router(opportunities.router)
app.include_router(outreach.router)
app.include_router(reports.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Radar Comercial API"}