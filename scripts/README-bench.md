# 꾸미기 참고 CLI (`scripts/bench.mjs`)

「집 정보 · 기록」 창의 **꾸미기 참고** 탭(인테리어 벤치마킹 모음)에 들어갈 묶음을 넣고 보는 CLI입니다. 사이트 API와 같은 처리(`lib/core/bench.ts`)를 씁니다.

- 저장소 규칙은 현황 CLI와 같습니다(`README-progress.md` 맨 위). 🔴 운영 키는 `.env.local`에 넣지 말고 저장소 밖에 받아 그 명령 안에서만 씁니다.
- 매번 stderr 첫 줄에 `[저장소] redis … ← 원격(운영) 데이터` / `[저장소] file .data/bench (로컬 연습용)`이 나옵니다. 결과 JSON은 stdout.
- 원격(운영)에 쓰는 `add`·`delete`는 **`--yes`가 있어야** 씁니다. 없으면 요약만 보여 주고 종료 코드 3. 모르는 옵션은 멈춥니다(종료 코드 2).
- 🔴 묶음 JSON(우리 집 평수 · 구조 이야기 포함)은 저장소 밖(스크래치패드 · 볼트)에 둡니다. `content/`에 넣지 않습니다.

## 명령

```bash
node scripts/bench.mjs get              # 묶음별 항목과 두 사람의 반응(좋아요 · 별로 · 메모)
node scripts/bench.mjs get --json       # 원본(항목마다 reactions 포함)
node scripts/bench.mjs add 묶음.json --dry-run          # 형식 검사 + 요약만
node scripts/bench.mjs add 묶음.json --yes [--by claude] # 넣기
node scripts/bench.mjs add 묶음.json --replace --yes     # 같은 수집일 묶음 바꿔 넣기
node scripts/bench.mjs delete 2026-10-22 --yes           # 묶음 지우기(되살릴 수 없음, 반응은 남음)
```

## 묶음 모양

```json
{ "collectedAt": "2026-10-22",
  "insights": [ { "title": "공통 패턴 한 줄", "detail": "설명" } ],
  "items": [ { "id": "b_…", "title": "", "source": "오늘의집|에어비앤비|블로그|브런치|유튜브|인스타|스레드|기타",
    "url": "https://…", "image": "https://… 또는 null", "space": "전체|거실주방|손님방|호스트방|욕실|현관|조명·소품",
    "fit": "101호에 맞는 이유", "takeaways": ["따라 할 점"], "cost": "", "caution": "또는 null" } ] }
```

- `collectedAt`(YYYY-MM-DD)마다 묶음 하나. 화면은 최신 묶음을 펼치고 지난 묶음은 접어 둡니다. 같은 날 다시 넣으려면 `--replace`.
- `id`는 `b_`로 시작(영문 · 숫자 · `_` · `-`, 61자까지), 한 묶음 안에서 겹치면 안 됩니다. **반응은 id에 붙으므로** 다음 수집에서 같은 자료를 다시 넣을 땐 같은 id를 쓰면 반응이 이어집니다.
- `url`·`image`는 http(s)만. `image`가 없거나 깨지면 화면에 출처 이름이 든 회색 칸이 나옵니다.
- 한도: 항목 150건, 공통 패턴 20개, 제목 150자, fit 600자, 따라 할 점 12개(각 300자), 비용 150자, 주의 400자. 모르는 필드는 버립니다.
- 형식이 틀리면 어느 칸이 틀렸는지 적고 아무것도 쓰지 않습니다(종료 코드 1).

## 저장 위치(Upstash)

| 키 | 종류 | 필드 → 값 |
|---|---|---|
| `oedomin:bench:batches` | 해시 | 수집일 → 묶음 JSON(+ `addedAt` · `addedBy`) |
| `oedomin:bench:reactions` | 해시 | `<항목 id>\|<이메일>` → `{ itemId, email, name, vote: up\|down\|null, memo, updatedAt }` |

현황 문서(`oedomin:progress:v1`)와 따로라 현황 version · 병합 규칙과 상관없습니다. 로컬 연습은 `.data/bench/batches.json` · `reactions.json`.
반응은 사이트에서만 남깁니다(`PUT /api/bench`, 로그인한 두 사람, 같은 사이트 요청만). 화면에는 이메일 대신 이름과 「내 것인지」만 보냅니다.
