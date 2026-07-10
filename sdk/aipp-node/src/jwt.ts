import crypto from 'crypto';

function base64urlEncode(str: string | Buffer): string {
  const buf = Buffer.isBuffer(str) ? str : Buffer.from(str);
  return buf.toString('base64url');
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyJwt(token: string, secret: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  
  // Constant time comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid JWT signature');
  }
  
  const payload = JSON.parse(base64urlDecode(encodedPayload));
  
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error('JWT expired');
  }
  
  return payload;
}
