import type { AuthSession } from '../stores/authStore';

/** Respuesta de POST /auth/login: oculta token y secretos SIP en consola. */
export function sanitizeLoginApiResponseForLog(data: unknown): unknown {
  if (data == null || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d };
  if (typeof out.token === 'string') out.token = '[REDACTED]';
  if (out.user != null && typeof out.user === 'object') {
    const u = { ...(out.user as Record<string, unknown>) };
    if ('sip_extension' in u) u.sip_extension = '[REDACTED]';
    if ('sip_password' in u) u.sip_password = '[REDACTED]';
    out.user = u;
  }
  return out;
}

/** Sesión en memoria/persistida: mismo tratamiento que la respuesta API. */
export function sanitizeSessionForLog(session: AuthSession | null | undefined): unknown {
  if (session == null) return null;
  const user = { ...(session.user as Record<string, unknown>) };
  if ('sip_extension' in user) user.sip_extension = '[REDACTED]';
  if ('sip_password' in user) user.sip_password = '[REDACTED]';
  return {
    ...session,
    token: session.token ? '[REDACTED]' : session.token,
    user: user as AuthSession['user'],
  };
}
