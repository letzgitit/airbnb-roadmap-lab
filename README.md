# airbnb-roadmap-lab (외도민 타임 라인)

공개 타임라인(정적 생성 + 6시간 ISR — 데일리 자동 참고 자료) + 구글 로그인한 두 사람만 보는 진행 현황(진행 상태 · 할 일 · 집 정보 · 기록 · 사진) Next.js 앱.
기존 단일 HTML은 `legacy/index.html`에 보존.

## 구조
- `app/`, `components/` — 화면. 공개 화면은 정적 생성, 현황은 로그인 뒤 `/api/progress`로만 읽음
- `lib/core/` — 병합 엔진·검증·저장소·마크다운 내보내기(서버와 CLI 공용)
- `content/` — 콘텐츠 JSON(다른 작업이 관리). 없으면 `fixtures/content-sample/` 사용
- `scripts/` — `progress.mjs`(CLI, `README-progress.md`), `photos.mjs`(사진 CLI, `README-photos.md`), `seed-progress.mjs`, `verify-sync.mjs`

## 주소로 바로 열기
창(시트)은 한 번에 하나만 열리고 주소 해시와 함께 움직입니다. 폰의 뒤로 가기가 창을 닫습니다.
- `/#step-3` 단계 창 · `/#notice` 주의사항(바뀐 규정 · 단계별 주의사항) · `/#scripts` 멘트함 · `/#records` 집 정보·기록(로그인했을 때만, 아니면 무시)
- 탭·펼침 상태는 주소에 넣지 않습니다.

## 실행
```bash
npm i
cp .env.example .env.local    # 값 채우기(로컬은 ALLOWED_EMAILS 만 있어도 됨)
npm run dev                   # 가짜 로그인: DEV_FAKE_LOGIN_EMAIL=me@example.test npm run dev  (?as=<이메일> 로 두 사람 흉내)
npm run build && npm start
```
저장소 env(`KV_REST_API_*` 또는 `UPSTASH_REDIS_REST_*`)가 없으면 `.data/progress.json`을 씁니다.

가짜 로그인은 `next dev`(NODE_ENV=development) + `DEV_FAKE_LOGIN_EMAIL` + **Redis env 없음** + Vercel 아님일 때만 켜집니다(운영 데이터를 가짜 로그인으로 열지 않게). `npm run dev`는 `127.0.0.1`에만 열립니다 — 같은 와이파이의 다른 기기가 가짜 로그인으로 들어오지 못하게.
