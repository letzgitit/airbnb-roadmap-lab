import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { NO_STORE } from '@/lib/http';
import { RESTYLE_DIR, RESTYLE_FILE_RE } from '@/lib/restyle';

// 꾸미기 › 사진 시안 사진 바이트: /api/restyle/<방 id>-<original|시안 id>.jpg. 로그인 안 한 방문자에게도 보인다(목록 /api/restyle 과 같다).
// 어떤 캐시에도 남기지 않는다. 이름 검사로 private/restyle/ 밖은 못 읽는다.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(_req: Request, ctx: RouteContext<'/api/restyle/[file]'>) {
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
