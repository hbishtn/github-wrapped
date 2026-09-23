from cryptography.fernet import Fernet
from django.conf import settings

def get_fernet():
    return Fernet(settings.ENCRYPTION_KEY.encode())

def encrypt_token(token: str) -> bytes:
    return get_fernet().encrypt(token.encode())

def decrypt_token(encrypted: bytes) -> str:
    return get_fernet().decrypt(encrypted).decode()