export const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'yopmail.com',
  'sharklasers.com', 'guerrillamail.info', 'grr.la', 'spam4.me',
  'tempail.com', 'mohmal.com', 'tempmailo.com', 'emailondeck.com',
]);

export const VPN_ASN_KEYWORDS = [
  'mullvad', 'nordvpn', 'expressvpn', 'protonvpn', 'surfshark', 'cyberghost',
  'private internet access', 'ipvanish', 'hide.me', 'tunnelbear', 'windscribe',
  'digitalocean', 'linode', 'vultr', 'hetzner', 'ovh', 'amazon', 'google cloud',
  'microsoft azure', 'oracle cloud', 'cloudflare warp',
];

export function analyzeEmail(email) {
  if (!email) return {};
  const parts = email.split('@');
  if (parts.length !== 2) return { malformed: true };
  
  const [local, domain] = parts;
  const domainLower = domain.toLowerCase();
  const domainParts = domainLower.split('.');
  const tld = domainParts[domainParts.length - 1];
  
  return {
    domain: domainLower,
    tld,
    isDisposable: DISPOSABLE_DOMAINS.has(domainLower),
    isPersonal: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com', 'proton.me'].includes(domainLower),
    localPartLength: local.length,
    hasPlus: local.includes('+'),
    plusTag: local.includes('+') ? local.split('+')[1] : null,
    hasNumbers: /\d/.test(local),
    allNumbers: /^\d+$/.test(local),
    looksGenerated: /^[a-z]{5,}\d{3,}$/i.test(local) || local.length > 30,
  };
}

export function parseAcceptLanguage(header) {
  if (!header) return { languages: [], primary: null };
  const languages = header.split(',').map(lang => {
    const [code, q] = lang.trim().split(';q=');
    return { code: code.trim(), q: q ? parseFloat(q) : 1.0 };
  }).sort((a, b) => b.q - a.q);
  return {
    languages: languages.map(l => l.code),
    primary: languages[0]?.code || null,
    count: languages.length,
  };
}

export function extractBrowser(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Chromium/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Opera/') || ua.includes('OPR/')) return 'Opera';
  return 'Other';
}

export function extractOS(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Other';
}

export function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function getRequestMeta(request) {
  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const acceptLang = parseAcceptLanguage(request.headers.get('Accept-Language'));
  const asOrg = (cf.asOrganization || '').toLowerCase();
  
  return {
    ip: request.headers.get('CF-Connecting-IP') || 'Unknown',
    asn: cf.asn || 'Unknown',
    asOrganization: cf.asOrganization || 'Unknown',
    isLikelyVPN: VPN_ASN_KEYWORDS.some(kw => asOrg.includes(kw)),
    colo: cf.colo || 'Unknown',
    clientTcpRtt: cf.clientTcpRtt || null,
    
    country: cf.country || 'Unknown',
    region: cf.region || 'Unknown',
    city: cf.city || 'Unknown',
    continent: cf.continent || 'Unknown',
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    timezone: cf.timezone || 'Unknown',
    postalCode: cf.postalCode || 'Unknown',
    isEUCountry: cf.isEUCountry === '1',
    isTor: cf.country === 'T1',
    
    httpProtocol: cf.httpProtocol || 'Unknown',
    tlsVersion: cf.tlsVersion || 'Unknown',
    tlsCipher: cf.tlsCipher || 'Unknown',
    
    userAgent: ua,
    isMobile: /Mobile|Android|iPhone|iPad/i.test(ua),
    isBot: /bot|crawl|spider|slurp|Googlebot|Bingbot/i.test(ua),
    browser: extractBrowser(ua),
    os: extractOS(ua),
    acceptLanguage: acceptLang.primary,
    languageCount: acceptLang.count,
    languages: acceptLang.languages.slice(0, 5),
    accept: request.headers.get('Accept') || 'Unknown',
    acceptEncoding: request.headers.get('Accept-Encoding') || 'Unknown',
    
    referer: request.headers.get('Referer') || 'None',
    refererDomain: extractDomain(request.headers.get('Referer')),
    origin: request.headers.get('Origin') || 'None',
    
    dnt: request.headers.get('DNT') === '1',
    secFetchSite: request.headers.get('Sec-Fetch-Site') || 'Unknown',
    secFetchMode: request.headers.get('Sec-Fetch-Mode') || 'Unknown',
    secFetchDest: request.headers.get('Sec-Fetch-Dest') || 'Unknown',
    secChUa: request.headers.get('Sec-CH-UA') || null,
    secChUaMobile: request.headers.get('Sec-CH-UA-Mobile') || null,
    secChUaPlatform: request.headers.get('Sec-CH-UA-Platform') || null,
    priority: request.headers.get('Priority') || null,
    
    cfRay: request.headers.get('CF-Ray') || null,
    cfVisitor: request.headers.get('CF-Visitor') || null,
    cfIpCountry: request.headers.get('CF-IPCountry') || null,
  };
}
