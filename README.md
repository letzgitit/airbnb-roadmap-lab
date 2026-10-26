# airbnb-roadmap-lab (외도민 타임 라인)

공개 타임라인(정적 생성 + 6시간 ISR — 데일리 자동 참고 자료) + 구글 로그인한 두 사람만 보는 진행 현황(진행 상태 · 할 일 · 집 정보 · 기록 · 사진) Next.js 앱.
기존 단일 HTML은 `legacy/index.html`에 보존.

## 구조
- `app/`, `components/` — 화면. 공개 화면은 정적 생성, 현황은 로그인 뒤 `/api/progress`로만 읽음
  - `app/(site)/` — 사이트 틀(머리글 · 내비게이션 · 진행 현황 · 사진)이 감싸는 페이지들(`components/shell/`). 지인 답 화면 `app/q/`와 `app/api/`는 이 밖
  - `components/ui/` — 공통 컴포넌트(제목 · 카드 · 추가 단추 · 필터 · 접기 · 배지 · 로그인 문 등). 화면 규칙은 `DESIGN.md`
- `lib/core/` — 병합 엔진·검증·저장소·마크다운 내보내기(서버와 CLI 공용)
- `content/` — 콘텐츠 JSON(다른 작업이 관리). 없으면 `fixtures/content-sample/` 사용
- `private/` — 공개 저장소에 올리지 않는 정적 파일(3D 시안 등). `.gitignore`에 있어 GitHub에는 없고, 배포에만 실린다. 로그인 확인하는 라우트로만 내려준다
- `scripts/` — `progress.mjs`(CLI, `README-progress.md`), `photos.mjs`(사진 CLI, `README-photos.md`), `seed-progress.mjs`, `verify-sync.mjs`

## 주소
| 주소 | 화면 | 누가 |
|---|---|---|
| `/` | 홈: 로그인하면 「할 일」 + 단계 안내(날짜순 · 단계순, 할 일 종류로 걸러 보기), 로그인 전엔 단계 안내 | 모두 |
| `/house` · `/house/log` · `/house/photos` · `/house/questions` | 우리 집: 집 정보 · 기록 · 사진 · 질문(+ 답 받는 링크) | 로그인 |
| `/decor/3d` · `/decor/photos` · `/decor/refs` | 꾸미기: 3D 시안 · 사진 시안 · 참고 모음(`/decor` → `/decor/3d`) | 모두(참고 모음은 공개로 고른 항목의 사진 · 제목만, 쓰기는 로그인) |
| `/money` | 돈 · 다른 집: 돈 흐름 · 지산 · 원주 할 일 · 원주 갈림길 | 로그인 |
| `/api/room3d` | 3D 시안 HTML(`private/room3d.html`, iframe 격리) | 모두 |
| `/api/decor/room3d-state` | 3D 시안에서 고른 상태(시안 · 켠 항목 · 문) 저장 · 불러오기, 살 것 값 표(`private/room3d-prices.json`) | 로그인 |
| `/api/decor/room3d-layouts` | 3D 시안에서 가구를 옮긴 배치를 이름 붙여 저장 · 불러오기 · 이름 바꾸기 · 지우기(키 `oedomin:room3d:layouts`, 이름 30자 · 20개까지) | 로그인 |
| `/q/<토큰>` | 답 받는 링크로 지인이 여는 화면(사이트 틀 밖) | 링크를 받은 사람 |

- 옛 주소: `/plan` → `/money`, `/questions` → `/house/questions`(`next.config.ts` redirects).
- 로그인하면 내비게이션(홈 · 우리 집 · 꾸미기 · 돈 · 다른 집)이 보인다. 로그인 전에는 홈 · 꾸미기 두 칸만. 폰은 화면 아래, PC는 머리글 안.

### 시트(홈 위에 뜨는 창)
공개 안내 셋만 시트로 엽니다. 한 번에 하나만 열리고 주소 해시와 함께 움직입니다. 폰의 뒤로 가기가 창을 닫습니다.
- `/#step-3` 단계 창 · `/#notice` 주의사항(바뀐 규정 · 단계별 주의사항) · `/#scripts` 대화 예시
- 옛 `/#records`(집 정보·기록 창)는 로그인했으면 `/house`로 옮겨 열고, 아니면 해시만 지웁니다.
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
