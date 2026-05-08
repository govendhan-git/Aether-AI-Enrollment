import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { getOrLinkProfile } from '@/lib/profile';
import { LegalEntity } from '@/models/LegalEntity';
import { redisGet, redisSet } from '@/lib/redis';
import crypto from 'crypto';

type ThemePayload = { className: string; cssVars?: Record<string, string> };

function sanitizeTheme(input: ThemePayload): ThemePayload {
  // constrain className
  let className = input.className?.startsWith('theme-') ? input.className : 'theme-classic';
  className = className.replace(/[^a-z0-9\-]/gi, '');
  // constrain css vars
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.cssVars || {})) {
    if (!/^--[a-z0-9\-_/]+$/i.test(k)) continue;
    if (typeof v !== 'string') continue;
    const vv = v.toString().slice(0, 200);
    out[k] = vv;
  }
  return { className, cssVars: Object.keys(out).length ? out : undefined };
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { profile } = await getOrLinkProfile();
    const p = profile as unknown as { legalEntityId?: string | null } | null;

    const cacheKey = `theme:${p?.legalEntityId ?? 'default'}`;
    const cached = await redisGet<ThemePayload>(cacheKey);
    let payload: ThemePayload | null = cached ?? null;

    if (!payload) {
      let className = 'theme-classic';
      let cssVars: Record<string, string> | undefined = undefined;
      if (p?.legalEntityId) {
        const entity = await LegalEntity.findById(p.legalEntityId).lean<{
          activeTheme?: string;
          themes?: Array<{ name: string; cssVars?: Record<string, string>; primary?: string; secondary?: string }>;
        }>();
        const active = entity?.activeTheme || 'classic';
        className = `theme-${active}`;
        const def = entity?.themes?.find((t) => t.name === active);
        if (def?.cssVars) cssVars = def.cssVars;
        if (!cssVars && (def?.primary || def?.secondary)) {
          cssVars = {
            '--brand': def?.primary || '#6C47FF',
            '--brand-600': def?.primary || '#5A38F2',
            '--brand-700': def?.secondary || '#482CC7',
          };
        }
      }
      payload = { className, cssVars };
      payload = sanitizeTheme(payload);
      // cache for 5 minutes
      await redisSet(cacheKey, payload, 5 * 60 * 1000);
    }

    const body = JSON.stringify(payload);
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    const inm = req.headers.get('if-none-match');
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': 'private, max-age=300',
          ETag: etag,
          Vary: 'Cookie',
        },
      });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        ETag: etag,
        Vary: 'Cookie',
      },
    });
  } catch {
    const fall = { className: 'theme-classic' } satisfies ThemePayload;
    return NextResponse.json(fall, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=60',
        Vary: 'Cookie',
      },
    });
  }
}
