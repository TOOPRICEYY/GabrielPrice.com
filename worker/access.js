// Checks the Cloudflare Access login on /admin requests.
// Access already stops anyone who has not signed in before the request reaches this Worker. The Worker checks again
// because the site is also reachable at *.workers.dev addresses (the per-PR previews), where Access does not stand in front.
//
// Access signs a JWT (an RS256-signed token) for each signed-in visitor and sends it in the Cf-Access-Jwt-Assertion header
// and the CF_Authorization cookie. We verify the signature against the team's public keys, then the audience tag (which
// Access application issued it), the issuer, the expiry, and that the email is on ALLOWED_EMAILS.

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

let certs = { url: '', keys: [], at: 0 };
async function keyFor(team, kid) {
  const url = team.replace(/\/+$/, '') + '/cdn-cgi/access/certs';
  const fresh = certs.url === url && Date.now() - certs.at < 10 * 60e3;
  let k = fresh && certs.keys.find((x) => x.kid === kid);
  if (!k) {                                   // keys rotate: refetch when a kid is unknown
    const r = await fetch(url);
    if (!r.ok) throw new Error('could not fetch Access keys');
    certs = { url, keys: (await r.json()).keys || [], at: Date.now() };
    k = certs.keys.find((x) => x.kid === kid);
  }
  if (!k) return null;
  return crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

function tokenOf(request) {
  const h = request.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('cookie') || '');
  return m ? m[1] : '';
}

// → the signed-in email, or null
export async function accessEmail(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  const allowed = String(env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!team || !aud || !allowed.length) return null;            // not configured: nobody gets in
  const t = tokenOf(request).split('.');
  if (t.length !== 3) return null;
  try {
    const head = json(t[0]), body = json(t[1]);
    if (head.alg !== 'RS256') return null;
    const key = await keyFor(team, head.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(t[2]), new TextEncoder().encode(t[0] + '.' + t[1]));
    if (!ok) return null;
    const now = Date.now() / 1000;
    if (![].concat(body.aud).includes(aud)) return null;
    if (body.iss !== team.replace(/\/+$/, '')) return null;
    if (!(body.exp > now - 30) || (body.nbf && body.nbf > now + 30)) return null;
    const email = String(body.email || '').toLowerCase();
    return allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}
