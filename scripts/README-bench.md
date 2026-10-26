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

## 올린 링크 (두 사람이 화면에서 올린 참고 자료)

꾸미기 참고 탭 맨 위 「링크 올리기」로 올린 링크는 처음엔 설명이 비어 있습니다(`status: pending`). Claude가 3일 작업에서 읽고 채웁니다.

```bash
node scripts/bench.mjs links --pending [--json]            # 설명이 비어 있는 올린 링크(id · 주소 · 올린 사람 · 한 줄 메모 · 그림 유무)
node scripts/bench.mjs links-fill 채우기.json --dry-run     # 형식 · 대상 검사만
node scripts/bench.mjs links-fill 채우기.json --yes         # 채우고 status 를 done 으로(운영은 --yes 필요)
```

```json
[ { "id": "b_link_1a2b3c4d5e", "fit": "101호에 맞는 이유", "takeaways": ["따라 할 점"], "cost": "", "caution": null,
    "space": "거실주방", "title": "(선택) 제목 바로잡기", "image": "(선택) https://… 또는 null" } ]
```

- `fit`은 꼭 필요. 한도는 묶음 항목과 같습니다. 없거나 지워진 링크는 건너뛰고 결과에 적습니다.
- 올린 링크의 id는 `b_link_` + 주소 해시 10자리라 같은 주소면 늘 같습니다. 반응(좋아요 · 별로 · 메모)은 이 id에 붙습니다.
- 화면에서 지운 링크는 흔적(`deletedAt`)만 남기고 감춥니다(되돌리기 가능). `links`에는 안 나옵니다.

## 공개 화면에 보일 항목 고르기

꾸미기는 로그인 안 한 방문자도 봅니다. 참고 모음은 **공개로 고른 수집 항목 중 사진이 있는 것만**, 사진 · 제목 · 출처 · 공간 · 원문 주소만 보입니다(맞는 이유 · 따라 할 점 · 비용 · 주의 · 공통점 · 반응 · 메모 · 올린 링크는 공개 응답에 없음).
고르지 않은 항목은 숨김이 기본이라, 새 묶음에 서류 · 문서 캡처가 섞여 들어와도 저절로 공개되지 않습니다. 고르는 곳은 화면(상세 맨 아래 「공개 화면에도 보이기」) 또는 이 CLI입니다. 저장 위치는 `oedomin:bench:public`(해시, 필드 = 항목 id).

```bash
node scripts/bench.mjs public [--json]                 # 항목마다 공개 · 숨김 · 사진 유무
node scripts/bench.mjs publish b_ohou_1 b_abnb_2 --dry-run   # 미리 보기
node scripts/bench.mjs publish b_ohou_1 b_abnb_2 --yes       # 공개로 고르기(운영은 --yes 필요)
node scripts/bench.mjs unpublish b_ohou_1 --yes              # 공개에서 빼기
```

## 묶음 모양

```json
{ "collectedAt": "2026-10-22",
  "insights": [ { "title": "공통 패턴 한 줄", "detail": "설명" } ],
  "items": [ { "id": "b_…", "title": "", "source": "오늘의집|에어비앤비|블로그|브런치|유튜브|인스타|스레드|핀터레스트|기타",
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
| `oedomin:bench:links` | 해시 | 링크 id → `{ id, url, title, image, space\|null, note, addedBy, addedByEmail, addedAt, status: pending\|done, fit?, takeaways?, cost?, caution?, source, deletedAt? }` |
| `oedomin:bench:reactions` | 해시 | `<항목 id>\|<이메일>` → `{ itemId, email, name, vote: up\|down\|null, memo, updatedAt }` |

현황 문서(`oedomin:progress:v1`)와 따로라 현황 version · 병합 규칙과 상관없습니다. 로컬 연습은 `.data/bench/batches.json` · `links.json` · `reactions.json`.
링크 올리기 · 지우기는 `POST` · `DELETE` · `PATCH /api/bench/links`(로그인 · 같은 사이트 요청만). 서버가 주소를 읽는 안전 검사(사설 IP 거절 · 리다이렉트 3번 · 5초 · 1MB)는 `lib/core/link-preview.ts`.
반응은 사이트에서만 남깁니다(`PUT /api/bench`, 로그인한 두 사람, 같은 사이트 요청만). 화면에는 이메일 대신 이름과 「내 것인지」만 보냅니다.
