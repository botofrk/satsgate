import hmac
import hashlib
import base64
import json
import time

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def _base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def sign_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _base64url_encode(json.dumps(header).encode('utf-8'))
    encoded_payload = _base64url_encode(json.dumps(payload).encode('utf-8'))
    
    msg = f"{encoded_header}.{encoded_payload}".encode('ascii')
    signature = hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def verify_jwt(token: str, secret: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
        
    encoded_header, encoded_payload, encoded_signature = parts
    msg = f"{encoded_header}.{encoded_payload}".encode('ascii')
    
    expected_signature = hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).digest()
    provided_signature = _base64url_decode(encoded_signature)
    
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise ValueError("Invalid JWT signature")
        
    payload = json.loads(_base64url_decode(encoded_payload).decode('utf-8'))
    
    if 'exp' in payload and time.time() >= payload['exp']:
        raise ValueError("JWT expired")
        
    return payload
