import { ImageResponse } from 'next/og';

// 공유 미리보기 그림(카톡·SNS). 외부 사진에 기대지 않고 빌드 때 한 번 그려 정적 PNG 로 둔다.
// ImageResponse 기본 글꼴에는 한글이 없어서, Noto Sans KR(OFL)을 Google Fonts 에서 이 그림에 쓰는 글자만(text=) 받아 넣는다.
export const alt = '외도민 타임 라인 — 외국인 도시민박업 실전 창업을 위한 A to Z 로드맵';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TITLE = '외도민 타임 라인';
const DESC = '외국인 도시민박업 실전 창업을 위한';
const DESC2 = 'A to Z 로드맵';
const LABEL = '주money';

async function loadFont(weight: 400 | 700, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!src) throw new Error(`Noto Sans KR ${weight} 글꼴 주소를 찾지 못함`);
  const res = await fetch(src[1]);
  if (!res.ok) throw new Error(`Noto Sans KR ${weight} 글꼴 받기 실패: ${res.status}`);
  return res.arrayBuffer();
}

export default async function Image() {
  const [bold, regular] = await Promise.all([
    loadFont(700, TITLE + LABEL),
    loadFont(400, DESC + DESC2),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: '#edfc47',
          color: '#000000',
          fontFamily: 'Noto Sans KR',
        }}
      >
        <div style={{ width: 72, height: 8, background: '#000000', marginBottom: 44 }} />
        <div style={{ fontSize: 104, fontWeight: 700, lineHeight: 1.15, letterSpacing: -2 }}>{TITLE}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32, fontSize: 44, fontWeight: 400, lineHeight: 1.4, color: '#262626' }}>
          <div>{DESC}</div>
          <div>{DESC2}</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 30, fontWeight: 700, color: '#000000' }}>{LABEL}</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Noto Sans KR', data: bold, style: 'normal', weight: 700 },
        { name: 'Noto Sans KR', data: regular, style: 'normal', weight: 400 },
      ],
    },
  );
}
