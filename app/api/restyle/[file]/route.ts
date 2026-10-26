import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { NO_STORE } from '@/lib/http';
import { RESTYLE_DIR, RESTYLE_FILE_RE } from '@/lib/restyle';

// 꾸미기 › 사진 시안 사진 바이트: /api/restyle/<방 id>-<original|시안 id>.jpg. 로그인한 두 사람만, 어떤 캐시에도 남기지 않는다.
// 로그인 확인을 이름 검사보다 먼저 한다 — 로그인 안 한 사람에게는 어떤 사진이 있는지도 알려 주지 않는다(늘 401/403).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(req: Request, ctx: RouteContext<'/api/restyle/[file]'>) {
  const a = await getActor(req);
  if (!a.ok) return json(a.status === 401 ? 'unauthorized' : 'forbidden', a.status);
  const { file } = await ctx.params;
  if (!RESTYLE_FILE_RE.test(file)) return json('not_found', 404);
  let buf: Buffer;
  try {
    buf = await readFile(path.join(RESTYLE_DIR, file));
  } catch {
    return json('not_found', 404);
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buf.length),
      'Content-Disposition': `inline; filename="${file}"`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
