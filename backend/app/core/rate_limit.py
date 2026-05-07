# app/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

# Limiter global — usa IP do cliente como chave.
# Aplicado por endpoint via @limiter.limit("N/period")
limiter = Limiter(key_func=get_remote_address)
