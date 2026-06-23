# app/core/security.py
import re
import bcrypt
import jwt
from datetime import datetime, timedelta
from app.core.clock import utcnow
from app.core.auth import SECRET_KEY, ALGORITHM


def validate_password_strength(password: str) -> str | None:
    """
    Regras mínimas de força de senha. Retorna mensagem de erro (pt-BR) se
    inválida, ou None se ok. Fonte única — usada em signup, change e reset.
    """
    if len(password) < 8:
        return "A senha deve ter no mínimo 8 caracteres."
    if not re.search(r"[A-Za-z]", password):
        return "A senha deve conter pelo menos uma letra."
    if not re.search(r"\d", password):
        return "A senha deve conter pelo menos um número."
    return None


def _bcrypt_bytes(password: str) -> bytes:
    # bcrypt só considera os primeiros 72 bytes e versões recentes LANÇAM erro
    # se a senha exceder isso. Truncamos de forma consistente (hash e verify)
    # para nunca dar 500 em senhas longas.
    return password.encode("utf-8")[:72]


def get_password_hash(password: str) -> str:
    hashed_password = bcrypt.hashpw(_bcrypt_bytes(password), bcrypt.gensalt())
    return hashed_password.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_bcrypt_bytes(plain_password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        # hash malformado/legado → falha de auth, nunca 500
        return False

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = utcnow() + expires_delta
    else:
        # Token expira em 7 dias por defeito
        expire = utcnow() + timedelta(days=7)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt