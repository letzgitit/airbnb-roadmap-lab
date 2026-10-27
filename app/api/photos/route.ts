import { NextResponse } from 'next/server';
import { getActor } from '@/lib/session';
import { addPhoto, listPhotos, PhotoError, reorderPhotos, toView } from '@/lib/core/photos';
import { checkUploadRequest, checkWriteRequest, NO_STORE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';      // sharp(이미지 처리)는 Node 에서만 돈다
export const maxDuration = 60;

const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'unauthorized' : 'forbidden' }, { status, headers: NO_STORE });

// 사진 목록. 서버가 읽을 때마다 세션과 허용 이메일을 확인한다(로그인 안 했으면 401, 허용 밖이면 403).
export async function GET(req: Request) {
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  try {
    const all = await listPhotos();
    return NextResponse.json({
      photos: all.filter((m) => !m.deletedAt).map(toView),
      trash: all.filter((m) => m.deletedAt).map(toView),
    }, { headers: NO_STORE });
  } catch (e) {
    console.error('photos list failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE });
  }
}

// 사진 한 장 올리기(multipart: file · stepId · caption · album(선택) · doc=1 글씨 많은 문서). 여러 장은 화면이 한 장씩 차례로 보낸다(진행 표시 · Vercel 본문 4.5MB 제한).
export async function POST(req: Request) {
  // 다른 사이트에서 날아온 요청 차단(세션 확인보다 먼저)
  const bad = checkUploadRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: 'invalid', message: '파일을 받지 못했어요. 다시 올려 주세요.' }, { status: 400, headers: NO_STORE });
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid', message: '파일이 없어요.' }, { status: 400, headers: NO_STORE });
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const m = await addPhoto({ stepId: form.get('stepId'), album: String(form.get('album') ?? ''), caption: String(form.get('caption') ?? ''), by: a.actor.name, data,
      doc: form.get('doc') === '1', taskId: form.get('taskId'), cardId: form.get('cardId') });
    return NextResponse.json({ photo: toView(m) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof PhotoError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
    console.error('photo upload failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error', message: '올리지 못했어요. 잠시 뒤 다시 해 주세요.' }, { status: 500, headers: NO_STORE });
  }
}

// 한 단계의 순서를 한 번에 바꾸기: { positions: [{ id, position }] }. 로그인 확인 · 같은 사이트 요청만(사진 하나 고치기와 같은 규칙).
export async function PATCH(req: Request) {
  const bad = checkWriteRequest(req);
  if (bad) return NextResponse.json({ error: bad }, { status: 403, headers: NO_STORE });
  const a = await getActor(req);
  if (!a.ok) return deny(a.status);
  try {
    const text = await req.text();
    const body = text.length <= 16384 ? JSON.parse(text) : null;
    if (!body || typeof body !== 'object' || !Array.isArray(body.positions)) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
    const done = await reorderPhotos(body.positions, a.actor.name);
    return NextResponse.json({ photos: done.map(toView) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof PhotoError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers: NO_STORE });
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
    console.error('photos reorder failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'server_error', message: '저장하지 못했어요.' }, { status: 500, headers: NO_STORE });
  }
}
