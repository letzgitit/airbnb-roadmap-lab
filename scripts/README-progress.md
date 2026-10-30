# 현황 CLI (`scripts/progress.mjs`)

사이트 DB가 「우리 현황」의 정본입니다. 터미널에서 같은 DB를 읽고 쓰는 CLI이고, 사이트 API와 **같은 병합·version 규칙**(`lib/core/engine.ts`)을 씁니다.

- 저장소: 환경변수(`.env.local`·`.env`도 읽음)에 `KV_REST_API_URL`/`KV_REST_API_TOKEN` 또는 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`이 있으면 **원격 Upstash(운영)**, 없으면 로컬 `.data/progress.json`.
- 🔴 운영 키는 `.env.local`에 넣지 않습니다(공개 저장소이고, 로컬 시험이 운영 데이터를 건드립니다). 저장소 밖에 받아 그 명령 안에서만 쓰고 바로 지웁니다:
  ```bash
  OUT=/저장소/밖/폴더   # 예: 세션 스크래치패드
  npx vercel@latest env pull "$OUT/prod.env" --environment=production --yes   # 저장소 폴더에서 실행
  (set -a; . "$OUT/prod.env"; node scripts/progress.mjs get)                  # 키는 이 괄호 안에서만
  rm "${OUT:?}/prod.env"
  ```
- 어느 저장소에 붙었는지 **매번 stderr 첫 줄**에 나옵니다: `[저장소] redis xxx.upstash.io  ← 원격(운영) 데이터` / `[저장소] file .data/progress.json  (로컬 연습용)`. 결과 JSON은 stdout에만 나옵니다.
- 🔴 원격(운영)에 쓰는 `apply`·`seed`는 **`--yes`가 있어야** 실제로 씁니다. 없으면 적용할 내용 요약만 보여 주고 종료 코드 3으로 멈춥니다.
- 모르는 옵션(`--dryrun` 같은 오타)은 실행하지 않고 멈춥니다.
- Node 22.18+ (TypeScript 파일을 직접 실행). 의존성은 앱과 공유(`npm i` 한 번).

## 명령

```bash
node scripts/progress.mjs get            # 사람이 읽기 좋은 요약 (id·version 포함)
node scripts/progress.mjs get --json     # 문서 원본
node scripts/progress.mjs apply patch.json --dry-run       # 미리 보기: 지금 값에 적용해 보고 쓰지 않음
node scripts/progress.mjs apply patch.json --yes [--by claude]   # 실제 적용 → 결과 JSON
node scripts/progress.mjs export-md ~/vault/현황.md          # 옵시디언용 마크다운 내보내기(저장소 밖 경로만)
```

### Claude가 대화 중 쓰는 순서

1. `get` — 지금 값과 각 항목의 `id`·`vN` 확인(첫 줄 `[저장소]`가 운영인지 확인).
2. 대화에서 정한 것을 임시 파일(저장소 밖, 예: 스크래치패드)에 `patch.json`으로 쓴다.
3. `apply patch.json --dry-run` — stderr 요약과 stdout의 `failed`(409·410·404)를 확인.
4. 문제없으면 `apply patch.json --yes` — `written: true`와 `failed: []` 확인. 409면 `failed[].error.current`(최신 내용)를 사용자에게 보여 주고 다시 정한다(마음대로 `force` 하지 않는다).
5. 필요하면 `export-md`로 볼트에 반영.

```bash
cat > /tmp/p.json <<'EOF'
{ "by": "claude", "ops": [
  { "op": "log.add", "kind": "통화", "text": "구청 위생과 통화: 서류 목록 받음" },
  { "op": "task.update", "id": "t_xxxxxxxxxxxx", "patch": { "done": true } }
] }
EOF
node scripts/progress.mjs apply /tmp/p.json --dry-run && node scripts/progress.mjs apply /tmp/p.json --yes
```

## patch.json

연산 배열이거나 `{ "by": "claude", "ops": [...] }`. 연산마다 `"by"`를 따로 줄 수 있고, 없으면 `--by` → 파일의 `by` → `claude` 순서입니다. 기록자는 사이트 화면에 그 이름으로 보입니다.

```json
{
  "by": "claude",
  "ops": [
    { "op": "task.add", "stepId": 2, "text": "구청 담당자에게 전화하기", "due": "2026-10-25", "kind": "연락" },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "baseVersion": 1, "patch": { "text": "구청 전화(오후)", "due": "2026-10-26" } },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "baseVersion": 2, "patch": { "kind": "서류" } },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "patch": { "done": true } },
    { "op": "task.add", "stepId": 7, "text": "가구 들이기", "start": "2026-11-10", "due": "2026-11-20" },
    { "op": "task.add", "parentId": "t_xxxxxxxxxxxx", "text": "침대 주문", "due": "2026-11-12" },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "baseVersion": 1, "patch": { "start": "2026-11-11", "parentId": null } },
    { "op": "task.delete", "id": "t_xxxxxxxxxxxx" },
    { "op": "task.restore", "id": "t_xxxxxxxxxxxx" },
    { "op": "step.update", "stepId": 2, "baseVersion": 0, "patch": { "status": "doing", "targetDate": "2026-10-31", "note": "메모" } },
    { "op": "log.add", "kind": "결정", "text": "1순위 매물을 A로 정함" },
    { "op": "log.update", "id": "l_xxxxxxxxxxxx", "baseVersion": 1, "patch": { "text": "수정한 문장" } },
    { "op": "log.delete", "id": "l_xxxxxxxxxxxx" },
    { "op": "property.add", "label": "인도일", "value": "2026-12-01" },
    { "op": "property.update", "id": "p_xxxxxxxxxxxx", "baseVersion": 1, "patch": { "value": "2026-12-15" } },
    { "op": "property.delete", "id": "p_xxxxxxxxxxxx" }
  ]
}
```

| 연산 | 필수 필드 | 비고 |
|---|---|---|
| `task.add` | `stepId`(1~14), `text`(1~200자) | `stepId`는 세부 항목(`parentId`)이면 빼도 된다(부모 단계를 따름). `start`(선택): 시작일 `YYYY-MM-DD` 또는 null. `parentId`(선택): 부모 할 일 id(`t_…`) — 아래 「시작일 · 세부 항목」. `due`: `YYYY-MM-DD` 또는 null. `kind`(선택): `결정` `연락` `일정 확정` `구매` `예약` `서류` `공사` `확인` 또는 null. 없으면 종류를 안 보인다(옛 할 일도 그대로 읽힌다). `note`(선택): 자세한 내용 ≤1000자(제목은 짧게, 길게 적을 것은 여기). `owner`(선택): `남편` `아내` `같이`. 설명서는 여기 넣지 않는다(문서 밖 — 아래 「설명서」) |
| `task.update` | `id`, `patch` | `patch`: `text` `due` `stepId`(단계 이동) `done` `kind`(위 값 또는 null = 종류 지우기) `note`(빈 글 · null = 지우기) `owner`(null = 지우기) `start`(시작일, null = 지우기) `parentId`(부모 할 일 id, null = 부모에서 떼기) `todoistId`(Todoist 짝, null = 짝 끊기). **`done`만, 또는 `todoistId`만 바꿀 땐 `baseVersion` 불필요**, 그 밖엔 필수 |
| `task.delete` / `task.restore` | `id` | 소프트 삭제(30일 보관 후 정리) |
| `step.update` | `stepId`, `baseVersion`, `patch` | `patch`: `status`(`todo` `doing` `done`) `targetDate` `note`(≤1000자). 아직 한 번도 안 고친 단계의 version은 0 |
| `log.add` | `kind`(`결정` `통화` `일정` `메모`), `text`(≤1000자) | 「현황 메모/결정 기록」 |
| `log.update` / `log.delete` / `log.restore` | `id` (+`baseVersion`, `patch`) | |
| `property.add` | `label`(≤40자), `value`(≤300자) | 매물 기본 정보(자유 key-value) |
| `property.update` / `property.delete` / `property.restore` | `id` (+`baseVersion`, `patch`) | |
| `money.add` | `date`(`YYYY-MM-DD` 또는 null), `text`(1~200자), `amount`(만원 정수, 나감 −·들어옴 +, 미정 null), `via`(`cash` 현금 · `credit` 마통), `project`(`oedomin` · `jisan`) | `estimate: true` = 화면에 「추정」. 「돈 · 다른 집」(/money)의 돈 흐름 줄 |
| `money.update` / `money.delete` / `money.restore` | `id`(`m_…`) (+`baseVersion`, `patch`) | `patch`: `date` `text` `amount` `via` `estimate` `project` |
| `plan.update` | `baseVersion`, `patch` | `patch`: `cash`·`credit`(출발점 현금 · 마통 여유, 만원) `fork`(원주 갈림길, 한 줄 = 한 갈래, 「조건 → 할 일」, ≤500자). 처음 version은 0 |
| `question.add` | `to`(받는 사람 이름, ≤20자), `text`(≤1000자) | 「질문」 화면(/house/questions). 처음 상태는 `open`(답 기다림) |
| `question.update` | `id`(`q_…`), `patch` | `patch`: `text` `to` `status`(`open` 답 기다림 · `answered` 답함 · `closed` 닫음). **`status`만 바꿀 땐 `baseVersion` 불필요**, 그 밖엔 필수 |
| `question.answer` | `id`, `text`(≤2000자) | 우리 쪽 답 · 덧붙이는 말(기록자 = `--by`). 상태는 그대로 |
| `question.answer.delete` | `id`, `answerId`(`a_…`) | 답 하나 지우기(30일 뒤 정리). 링크로 받은 답이 하나도 안 남으면 `answered` → `open` |
| `question.delete` / `question.restore` | `id` | |
| `question.seen` | `id` | 「새 답」 표시 끄기 |
| `guest.add` | `name`(≤20자) | 답 받는 링크 만들기. 결과의 `token`으로 주소 `/q/<token>`. `get` 출력의 `[손님 링크]` 칸(CLI 출력 이름은 그대로)에 전체 주소가 나온다 |
| `guest.revoke` | `id`(`g_…`) | 링크 끊기(그 주소는 바로 안 열린다) |

### 메모 안 체크리스트 (`note`의 `- [ ]` 줄)

장보기처럼 날짜 · 담당 없이 챙길 것만 늘어놓을 때는 할 일을 여러 개 만들지 말고 **그 할 일 메모(`note`)에 한 줄에 하나씩** 적는다(2026-10-30). 줄 모양: 안 한 것 `- [ ] 글`, 한 것 `- [x] 글`(x 대소문자 둘 다, 대괄호 뒤 띄어쓰기 한 칸, 글이 비면 항목이 아님). 다른 메모 줄(전화 · 멘트 · 「- 」 질문 줄)과 섞어도 되고 메모 순서대로 보인다. 화면은 펼친 메모에서 체크 칸으로 바로 체크 · 「＋ 체크 항목」(마지막 체크 줄 밑에 `- [ ] 글` 한 줄을 더함), 접힌 줄에는 「3/10」. 체크리스트가 아직 없는 할 일은 화면 편집 폼 메모 칸 밑 「＋ 체크 항목」으로 시작한다(빈 체크 줄을 넣어 줌, 안 쓴 줄은 저장 때 버림). 화면 편집 폼 메모 칸에서만 체크 줄이 「☐ 글」 · 「☑ 글」로 보이고 저장은 늘 `- [ ] ` · `- [x] ` 모양이다 — CLI 로 쓸 때도 `- [ ] ` · `- [x] `로 쓴다. 데이터는 메모 글 그대로라 Todoist 설명 · 검색 · `export-md`(☐ · ☑)가 따로 손댈 것 없이 따라간다. 날짜 · 간트 줄이 필요한 일은 아래 「세부 항목」으로.

```json
{ "op": "task.update", "id": "t_xxxxxxxxxxxx", "baseVersion": 3, "patch": { "note": "전화 가게 02-000-0000\n- [ ] 화장지\n- [ ] 수건\n- [x] 샴푸" } }
```

메모 전체를 보내므로 그 사이 화면에서 누가 체크했으면 `409`가 난다 — `get`으로 최신 메모를 받아 그 위에 고쳐 다시 보낸다(`force`로 덮지 않는다). 할 일 규칙(「짧고 깔끔하게」)은 그대로 — 체크 줄도 물건 이름 정도로 짧게.

### 시작일 · 세부 항목 (`start` · `parentId`)

단계 탭 트리 간트용. 둘 다 선택이고, 없는 옛 할 일은 그대로 읽힌다(옮기는 작업 없음). 규칙 코드: `lib/core/task-tree.ts` · `lib/core/engine.ts`.

- `start`: 시작일. 없으면 마감일 하루짜리로 그린다(`taskStart(t) = start ?? due`). 마감일이 있으면 **시작일 ≤ 마감일**이어야 하고, 고칠 때는 지금 값과 합쳐서 본다 — 마감일만 시작일보다 앞으로 당기면 `400 start_after_due`(시작일도 같이 보낸다). 마감일 없이 시작일만 있어도 된다.
- `parentId`: 세부 항목의 부모. **한 층만**이다. 거절(`400`, `error` 코드 · `message` 문장):
  - `parent_not_found` 없는 부모 · `parent_deleted` 지운 부모 · `parent_self` 자기 자신 · `parent_is_child` 세부 항목을 부모로 · `has_children` 세부 항목이 있는 할 일을 다른 할 일 밑으로 · `step_mismatch` 부모와 다른 단계.
- 단계: 세부 항목은 늘 부모와 같은 단계다. 부모를 새로 정하면 그 부모의 단계로 옮겨진다. 세부 항목의 `stepId`만 따로 바꾸면 거절(같은 값을 보내는 것은 괜찮다) — 떼면서 옮기려면 `{"parentId": null, "stepId": N}`. **부모의 단계를 옮기면 세부 항목(지운 것 포함)도 같이 옮겨진다.**
- 지우기 · 되살리기: 부모를 지우면 살아 있는 세부 항목도 같은 시각으로 같이 지운다. 부모를 되살리면 그때 같이 지운 세부 항목만 같이 되살린다(따로 먼저 지운 것은 그대로). 부모가 지워져 있는데 세부 항목만 되살리면 `400 parent_deleted`(부모부터). 부모가 30일 지나 정리돼 없으면 세부 항목은 맨 위 층으로 되살아난다.
- Todoist: 세부 항목도 평평한 할 일로 보내고(`parent_id` 없음) 시작일은 보내지 않는다(1차). 아래 「Todoist 동기화」 표.
- `get`은 세부 항목을 부모 밑에 `└`로, `export-md`는 두 칸 들여 쓴다. 시작일이 있으면 `시작 …` / `시작 ~ 마감 …`.

### 설명서 (`scripts/guides.mjs`)

할 일마다 「왜 · 어떻게 하는지」 길게 적어 두는 설명서(2026-10-28). 새 홈 할 일 줄 제목 뒤 물음표를 누르면 시트로 열린다. **현황 문서 밖에 따로 저장한다** — 문서 하나 상한(400KB)과 화면을 열 때마다 문서를 통째로 받는 무게 때문(설명서 68개 ≈ 400KB).

- 저장: 운영 = Upstash 해시 `oedomin:guides`(필드 = 할 일 id, 값 = `{ md, version, updatedAt, updatedBy }` JSON), 로컬 = `.data/guides.json`. 코드 `lib/core/guides.ts`.
- 규칙: 마크다운 ≤6000자, 앞뒤 공백만 지우고 줄바꿈은 그대로, 빈 글이면 지움. 화면 저장은 `version`이 다르면 409(다시 저장하면 덮어씀). 할 일을 지워도 설명서는 남고(되살리기 대비) 화면 목록에서만 빠진다. **Todoist 로 보내지 않는다.** `export-md`에도 넣지 않는다.
- API(로그인한 두 사람만): `GET /api/guides` → `{ ids: { [할 일 id]: { len, version } } }`(지운 할 일 뺌), `GET /api/guides/<id>` → `{ guide }`, `PUT /api/guides/<id>` `{ md, baseVersion }`(없던 설명서면 0).
- 화면이 읽는 모양: `## 소제목`(### = 작은 소제목) · `- 점 목록` · `1. 번호 목록` · `**굵게**` · `[글](https://…)`(새 창, 글자에 도메인이 없으면 문단 끝에 「(도메인)」) · `> 인용` = 「알아 두기」 옅은 면 상자 · `| 표 |` · `---`. 소제목은 「왜 해야 하나요 / 어떻게 하나요 / 준비물 / 알아 두면 좋은 것 / 자주 하는 실수」처럼.
- CLI(첫 줄 `[저장소]`는 progress.mjs 와 같은 규칙, **운영에 쓰려면 `--yes`**, 쓰는 사람 이름은 `--by`, 없으면 claude). CLI 쓰기는 version 을 보지 않고 덮어쓴다.

```bash
node scripts/guides.mjs list                                   # 설명서가 있는 할 일: id · 글자 수 · version · 제목(지운 할 일 표시)
node scripts/guides.mjs get t_xxxxxxxxxxxx > 전입신고.md        # 본문
node scripts/guides.mjs set t_xxxxxxxxxxxx 전입신고.md --yes    # 한 개 덮어쓰기(빈 파일이면 지움)
node scripts/guides.mjs import guides.json --dry-run            # { "t_…": "## 왜 해야 하나요\n…", … } 미리 보기(새로 · 바꿈 · 지움 · 그대로 · 현황에 없는 할 일)
node scripts/guides.mjs import guides.json --yes                # 한 번에 넣기 — 하나라도 형식이 틀리면 아무것도 쓰지 않는다
```
- 할 일 문서에 `guide`를 넣는 연산은 없다(`task.update` patch 에 넣으면 거절, `task.add`에 넣으면 버림). 잠깐 있던 판의 `guide` 키가 문서에 남아 있으면 읽을 때 버린다.

### 블록 메모 (`scripts/cardnotes.mjs`)

새 홈 일터 탭(행정 · 설비 · 운영)의 단계 블록마다 다는 짧은 메모(2026-10-28). 블록 몸통의 할 일 줄 밑에 한 줄씩(날짜 · 쓴 사람). **현황 문서 밖에 따로 저장한다**(설명서와 같은 까닭 — 할 일 문서 구조는 바꾸지 않는다). 더하기 · 지우기만 있고 고치기는 없다.

- 저장: 운영 = Upstash 해시 `oedomin:cardnotes`(필드 = 블록 id, 값 = 메모 배열 `[{ id, text, at, by }]` JSON), 로컬 = `.data/cardnotes.json`. 코드 `lib/core/cardnotes.ts`.
- 블록 id = 「분야.블록」: `admin.move-in` · `admin.register` · `admin.safety` · `admin.inspect` · `admin.biz` · `admin.step-1`~`3`, `facility.bath` · `facility.wall` · `facility.aircon` · `facility.light` · `facility.buy` · `facility.other`, `ops.listing` · `ops.guide` · `ops.supplies` · `ops.other`(코드 `components/simple-home/home-model.ts` `blockId`). 바꾸지 않는다(메모 · 사진이 이 이름에 붙는다).
- 규칙: 글은 줄바꿈 · 겹친 띄어쓰기를 띄어쓰기 하나로, 1~500자, 블록마다 200개까지. 메모 id `n_` + 10자. 적은 순으로 보인다. 두 사람이 동시에 써도 서로 덮지 않는다(필드 하나 비교 후 쓰기).
- API(로그인한 두 사람만, 쓰기는 같은 출처 JSON 요청만):
  - `GET /api/cardnotes` → `{ notes: { [블록 id]: 메모[] } }`(메모 없는 블록은 빠짐)
  - `POST /api/cardnotes/<블록 id>` `{ text }` → `{ note }`(쓴 사람 = 로그인한 사람). 되돌리기는 `{ restore: <지운 메모> }` → 같은 id · 시각 · 쓴 사람으로 다시(이미 있으면 그대로)
  - `DELETE /api/cardnotes/<블록 id>/<메모 id>`(본문 `{}`) → `{ note }`(지운 메모 — 화면이 8초 「되돌리기」에 쓴다). 없으면 404
- 블록 사진은 메모와 달리 **사진 저장소**에 올리고 사진 정보에 `cardId`(블록 id)를 단다(`POST /api/photos` 폼에 `cardId`). 옛 사진은 키가 없고 `null`로 읽힌다. `taskId`와 같이 쓰지 않는다.

```bash
node scripts/cardnotes.mjs list                                   # 메모 있는 블록마다: 메모 id · 적은 날(한국) · 쓴 사람 · 글
node scripts/cardnotes.mjs list admin.move-in                     # 한 블록만
node scripts/cardnotes.mjs add admin.move-in 신분증 원본 챙기기 --by 나 --yes   # 한 줄 더하기(운영이면 --yes)
node scripts/cardnotes.mjs rm admin.move-in n_0123456789 --yes    # 지우기(되살리기는 출력 JSON 의 removed 를 API restore 로)
```

- 「사용자 체크리스트 항목」은 **할 일(task)과 같은 항목**입니다. `checklist.add/update/delete/restore`는 `task.*`의 별칭입니다.
- `baseVersion`은 `get`에서 본 `(id … vN)`의 N입니다. 서버 version과 다르면 **그 연산만** 409로 실패하고 나머지는 적용됩니다(결과의 `failed`에 최신 내용이 들어 있음). 덮어쓰려면 연산에 `"force": true`.
- 삭제된 항목을 고치려 하면 410(`deleted`).
- 형식이 틀린 연산이 **하나라도** 있으면 아무것도 쓰지 않습니다(`written: false`).
- `id`는 `t_`·`l_`·`p_`로 시작하는 서버가 만든 값만 받습니다.
- 종료 코드: 전부 적용 0, 하나라도 실패 1, 사용법 오류 2, 운영인데 `--yes` 없음 3.

### 결과(JSON)

```json
{ "store": "file", "written": true, "dryRun": false,
  "applied": [ { "index": 0, "op": "task.add", "result": { "id": "t_…", "version": 1 } } ],
  "failed":  [ { "index": 3, "op": "step.update", "status": 409, "error": { "error": "conflict", "current": { "version": 1 } } } ] }
```

## Todoist 동기화

Todoist 라벨 `외도민`(바꾸려면 `TODOIST_LABEL`) 할 일 ↔ 사이트 할 일을 양쪽으로 맞춘다. 코드: `lib/core/todoist*.ts`, 웹훅 `app/api/todoist/webhook`.

🔴 **짝(`todoistId`)이 있는 할 일만 맞춘다**(2026-10-29). 사이트는 두 사람이 같이 쓰고 Todoist 는 한 사람 것이라, **사이트에서 새로 만든 할 일은 Todoist 에 만들지 않는다**(화면 · CLI `apply` · 부모 지우기/되살리기 연쇄 · `todoist-sync --yes` 모두). Todoist 에도 둘 할 일은 Todoist 에서 먼저 만든다 → 웹훅이 사이트에 짝지은 할 일을 만든다 → 그 뒤로는 어느 쪽에서 고쳐도 맞춰진다. 이미 있는 사이트 할 일을 잇고 싶으면 아래 「짝 맞추기」로 짝을 적는다.

- 🔴 Todoist 토큰(`TODOIST_API_TOKEN` · `TODOIST_CLIENT_SECRET`)은 **Vercel 환경 변수에만** 둔다. `.env.local`에 넣지 않는다(공개 저장소 · 로컬 시험). CLI에서 쓸 때는 운영 키와 같이 저장소 밖에 받아 그 명령 안에서만 쓴다.
- Todoist 로 보내는 것은 **운영 저장소(redis)일 때만**이다. 로컬 연습 저장소면 토큰이 있어도 보내지 않는다(stderr `[Todoist] 로컬 연습 저장소 — 반영 건너뜀`). 시험할 때만 `TODOIST_API_BASE`에 가짜 서버 주소를 주면 로컬에서도 그 서버로 보낸다.
- 운영 저장소에 `apply --yes` 하는데 **짝 있는 할 일이 걸린 연산**(짝 있는 할 일의 고치기 · 완료 · 지우기 · 되살리기, 짝 있는 세부 항목을 가진 부모 지우기 · 되살리기, `todoistId` 적기)이 있고 토큰이 없으면 쓰지 않고 멈춘다(종료 코드 4). Todoist 에 안 보내도 되면 `--no-todoist`(나중에 `todoist-sync`로 맞출 수 있다). `task.add` · 짝 없는 할 일만 건드리면 토큰이 없어도 멈추지 않는다(어차피 보내지 않는다).

| 사이트(짝 있는 할 일) | Todoist | 비고 |
|---|---|---|
| 새로 만들기(`task.add`) | — | 보내지 않는다(짝이 없으므로). Todoist 에서 만든 할 일만 웹훅으로 사이트에 들어와 짝이 생긴다 |
| `text` | `content` | 200자 넘으면 199자 + `…` 로 줄여 받는다 |
| `note` | `description` | 1000자 넘으면 999자 + `…` |
| `due` | `due` | 날짜만. 시각이 있는 Todoist 날짜는 그날 날짜로 받는다. 사이트에서 날짜를 지우면 Sync API `item_update` 에 `due: null` |
| `done` | 완료(close / reopen) | |
| 삭제 · 복원 | 삭제 / 새로 만들기 | Todoist 는 지운 할 일을 되살리는 API 가 없어, 짝 있던 할 일을 사이트에서 복원하면 새로 만들고 새 id 를 적는다(원래 짝이 있던 할 일이라 만든다) |
| `stepId` `kind` `owner` | — | 사이트에만 |
| `start` `parentId` | — | 사이트에만(1차). 세부 항목은 Todoist 에 평평한 할 일로 간다. Todoist 에서 온 변경은 이 두 칸을 지우지 않는다. 예외: Todoist 에서 마감일을 시작일보다 앞으로 옮기면 시작일을 마감일로 맞춘다 · Todoist 에서 부모를 지우면 세부 항목은 지우지 않고 맨 위 층으로 뗀다(Todoist 에선 따로 있는 할 일이라). 사이트에서 부모를 지우거나 되살리면 짝 있는 세부 항목도 Todoist 에 같이 반영한다(짝 없는 부모 · 세부 항목은 보내지 않는다) |

- **Todoist → 사이트**: 웹훅(`item:added` `item:updated` `item:completed` `item:uncompleted` `item:deleted`) → 서명(`X-Todoist-Hmac-SHA256` = base64 HMAC-SHA256(client secret, 본문)) 확인 → 엔진 연산 `task.fromTodoist`(서버 안에서만 만든다, CLI · API 로는 못 보낸다). 라벨 없는 할 일은 무시한다. 짝이 있던 할 일에서 라벨을 떼도 사이트 할 일은 그대로 둔다.
- **사이트 → Todoist**: `/api/progress/mutate`(응답 뒤 `after`)와 이 CLI의 `apply`(쓴 뒤, `--dry-run` · `--no-todoist` 제외)가 같은 `pushToTodoist`(`lib/core/todoist-push.ts`)를 부른다. **짝 없는 할 일이면 아무것도 보내지 않는다**(Todoist 호출 0번, `todoistError`도 안 남김). 짝이 있으면 보낼 때마다 문서를 다시 읽어 **지금 사이트 값과 `todoistSent`(Todoist 에 있다고 아는 값)의 차이만** 보내고 `todoistSent`를 맞춘다. 그래서 같은 할 일에 대한 보내기 둘이 순서가 뒤집혀도 마지막 상태로 모인다. 복원으로 새로 만든 Todoist id · `todoistSent` 는 `task.todoistSent`(서버 전용)로 적고 항목 version 을 올리지 않는다. 보내기가 실패하면 할 일에 `todoistError`가 남는다(`get`에 ⚠️).
- **돌고 도는 것 막기 · 늦게 온 웹훅**: 웹훅으로 바뀐 것은 Todoist 로 다시 보내지 않는다. 웹훅 값이 `todoistSent`와 같으면 되돌아온 것(또는 Todoist 쪽은 그대로)이라 사이트를 건드리지 않는다. 다른 칸 중 사이트에서도 고친 칸(사이트 값 ≠ `todoistSent`)은 사람이 웹훅 시각보다 나중에 고쳤으면 사이트 값을 둔다(다음 보내기가 맞춘다). 이미 반영한 것보다 앞선 웹훅(`todoistAt`)은 버리고, 같은 시각은 값으로 가린다. 사이트가 막 만든 Todoist 할 일(사이트가 만드는 것은 이제 복원 때뿐)이 `item:added`로 되돌아오면(아직 id 를 못 적었을 때) 짝 없는 · 같은 제목 · 같은 날짜 · 10분 안에 만들거나 고친 사이트 할 일에 짝만 적는다(단계 고르기도 안 한다). 짝을 적는 쪽이 늦으면 방금 만든 Todoist 할 일을 중복으로 보고 지운다. 저장소가 바빠(503) 웹훅 반영에 실패하면 500 으로 답해 Todoist 가 다시 보낸다(값으로 견주므로 다시 받아도 안전).
- **복원**: 짝 있던 할 일을 되살렸는데 Todoist 에서도 지웠으면(`todoistSent.deleted`) 새로 만들고 새 id 를 적는다. 짝이 한 번도 없던 할 일은 되살려도 만들지 않는다. 지우기가 실패해 Todoist 에 아직 있으면 새로 만들지 않는다. 이미 지운 것은 다시 지우지 않는다.
- **반복 할 일**: Todoist 에서 반복 할 일을 완료하면 다음 날짜로 넘어갈 뿐이라 사이트에는 「안 끝남 · 새 날짜」로 들어온다. 🔴 사이트에서 반복 할 일의 날짜를 고치면 Todoist 쪽 반복 규칙이 사라진다(날짜 하나로 바뀐다). 반복 할 일의 날짜는 Todoist 에서 고친다.
- **제목 정규화**: 사이트 입력과 Todoist 에서 받는 제목 모두 줄바꿈 · 겹친 공백을 한 칸으로 줄이고 앞뒤 공백을 지운다.
- **Todoist 에서 새로 만든 할 일의 단계 · 종류**: ① `ANTHROPIC_API_KEY`가 있으면 Claude API(`claude-haiku-5-5`, 4초 제한)에 제목과 14단계 이름 · 설명(공개 콘텐츠)을 주고 단계 번호 · 종류를 받는다 → ② 실패 · 키 없음이면 낱말 규칙(`lib/core/todoist-classify.ts`) → ③ 그래도 없으면 지금 진행 중인 단계(없으면 아직 안 끝난 첫 단계). 고른 방법은 할 일의 `autoFill`(`claude` · `keyword` · `default`)에 남고, `get` 에 「단계 자동(…)」, md 에 「(단계 자동)」으로 보인다. 사람이 단계나 종류를 고치면 지워진다. 만든 사람(`createdBy`)은 `Todoist`.
  - 단계를 다시 보려면: `get --json` 에서 `autoFill` 이 있는 할 일을 찾아 `task.update`로 `stepId` · `kind`를 고친다.

### 다시 맞추기 (`todoist-sync`)

```bash
(set -a; . "$OUT/prod.env"; node scripts/progress.mjs todoist-sync)          # 차이만 보기
(set -a; . "$OUT/prod.env"; node scripts/progress.mjs todoist-sync --yes)    # 다른 칸을 사이트 값으로 맞춤
```

- Todoist 의 라벨 붙은 끝나지 않은 할 일(`GET /api/v1/tasks?label=…`)을 읽어 사이트 현황과 견준다(운영 저장소 + 토큰일 때만 돈다). 보여 주는 것: 「값이 다름」 · 「보내기 실패 표시」 · 「Todoist 에 없음(완료 · 삭제됨?)」 · 「짝 없음」 · 「Todoist 에만」.
- `--yes`는 「값이 다름」 · 「보내기 실패 표시」만 사이트 값(정본)으로 맞춘다. 나머지는 손대지 않는다(짝은 아래 짝 맞추기 도구로).
- Vercel 에서 토큰을 「Sensitive」로 두면 `vercel env pull`로 안 내려온다 — 그때는 CLI 쓰기에 `--no-todoist`를 붙이고, 맞추기는 사이트(배포) 쪽 보내기에 맡긴다.

### 이미 있는 할 일 짝 맞추기 (`scripts/todoist-match.mjs`)

사이트 할 일과 Todoist 할 일 목록을 제목 · 날짜로 짝지어 표를 만들고, 짝을 적는 연산 묶음을 만든다. 저장소 · Todoist 에 붙지 않고 파일만 읽고 쓴다(출력은 저장소 밖에만).

```bash
OUT=/저장소/밖/폴더
node scripts/progress.mjs get --json > "$OUT/site.json"            # 또는 사이트 GET /api/progress 응답
# Todoist 할 일 목록(GET /api/v1/tasks 응답 {results:[...]} 또는 배열)을 "$OUT/todoist.json" 에 저장
node scripts/todoist-match.mjs --site "$OUT/site.json" --todoist "$OUT/todoist.json" --out "$OUT/match" --ops "$OUT/link.json"
#   → match.json(표) · match.md(사람이 읽는 표) · link.json(patch). --min 날짜다름|비슷함 으로 더 넓게, --all-labels 로 라벨 없는 것도
node scripts/progress.mjs apply "$OUT/link.json" --dry-run && node scripts/progress.mjs apply "$OUT/link.json" --yes
```

- 정도: 「확실」(제목 · 날짜 같음) · 「날짜다름」(제목 같음) · 「비슷함」(공백 · 문장부호 빼고 많이 닮음, 한쪽이 잘림). 기본은 「확실」만 연산에 넣는다. 제목은 공백 · 문장부호 · 대소문자를 무시하고 견준다.
- 짝을 적는 연산(`todoistId`만 바꾸는 `task.update`)은 Todoist 를 부르지 않는다. 짝을 적어도 다른 칸(제목 · 날짜 · 완료)을 맞추지는 않는다 — 다음에 한쪽에서 고칠 때 맞춰진다.
- 이미 짝이 있는 사이트 할 일 · 이미 짝으로 쓰인 Todoist id · 지운 사이트 할 일은 후보에서 뺀다.

### 시험

```bash
node --test scripts/test-todoist.mjs   # 임시 폴더의 연습 파일만 쓰고, Todoist · Claude API 는 가짜 fetch
node --test scripts/test-task-tree.mjs # 시작일 · 세부 항목 규칙(임시 폴더의 연습 파일만)
node --test scripts/test-cardnotes.mjs # 블록 메모 저장 · 지우기 · 되돌리기, 사진 cardId(임시 폴더의 연습 파일만)
npm test                               # 위 셋 + 설명서 · 화면 계산 시험
```

## export-md

`export-md <out.md>`는 진행률, 매물 정보, 단계별 상태·목표일·메모, 할 일(미완료 먼저·마감일 순, 완료는 `<details>`로 접음), 최근 기록 20건, 마지막 동기화 시각을 씁니다. 맨 위에 「자동 생성 — 직접 고치지 말 것」 경고가 붙습니다. 🔴 이 저장소는 GitHub 공개 저장소라, 출력 경로가 저장소 안이면서 git이 무시하지 않는 곳이면 거부합니다(볼트 등 저장소 밖에 쓰세요). 할 일 줄은 `- [ ]`가 아니라 `- ☐` / `- ☑`입니다(볼트 Todoist 플러그인이 체크박스를 흡수하므로).

## 돈 · 다른 집 (`/money`, 옛 `/plan`)

로그인한 사람만 보는 돈 흐름 · 지산 · 원주 할 일 · 원주 갈림길 화면(우리 할 일은 홈 「할 일」에 있다). 서버(`app/api/plan`)가 이 문서(`oedomin:progress:v1`)와 지산 사이트 문서(같은 Upstash의 `jisan:progress:v1`, **읽기만**)를 합쳐 내려준다.
- 일정 = 두 문서의 마감일 있는 할 일. 글 끝 `(추정)` · `(제안)`은 작은 표시로 보인다.
- 돈 흐름 = 이 문서의 `money`(위 `money.*`) + 출발점 `plan`. 금액 · 이름은 코드와 `content/`에 넣지 않는다(공개 저장소).
- 지산 할 일을 더하거나 고치려면 지산 사이트 API로 한다(여기서는 쓰지 않는다).
- `export-md --doc <파일>`: 운영 키 없이 사이트 `GET /api/progress` 응답을 저장한 파일로 md 를 만든다.

## 초기 데이터

`node scripts/seed-progress.mjs scripts/seed-example.json [--force] [--yes]` — 가짜 예시 데이터를 저장소에 넣습니다. 할 일에 `start`(시작일)와 `children`(세부 항목 배열, 단계는 부모를 따름)을 줄 수 있습니다(저장소가 비어 있을 때만, `--force`는 지우고 다시, 원격(운영)이면 `--yes`도 필요). 실제 개인 정보는 이 파일에 넣지 마세요.

## 질문 · 답 받는 링크 (`/house/questions` · `/q/<token>`, 옛 `/questions`)

- 질문은 이 현황 문서의 `questions`, 답 받는 링크는 `guests`에 들어 있다(같은 병합 · version 규칙). 연산 이름(`guest.*`)과 CLI 출력의 「손님 링크」는 그대로다.
- 답 받는 링크 화면 `/q/<token>`은 로그인 없이 열린다. 링크에 적은 이름과 받는 사람(`to`)이 같은(대소문자 · 앞뒤 공백 무시) 질문과 답만 보이고, 다른 현황은 나가지 않는다(`lib/core/questions.ts` `guestView`). 끊은 링크 · 틀린 토큰은 「열 수 없는 링크」.
- 링크로 받는 답은 보통 HTML 폼으로 `POST /q/<token>/answer` → 엔진 연산 `question.guestAnswer`(서버 안에서만 만든다, CLI · API로는 못 보낸다). 답이 달리면 `answered` + 「새 답」 표시. 막는 것: 2000자 넘는 답, 같은 링크로 5초 안에 또 보내기, 한 시간 30개 넘게, 닫힌 질문, 다른 출처에서 보낸 폼.
- 지인이 답하는 화면은 자바스크립트 없이 돌고 스타일도 파일 안에 있다(`components/questions/GuestPage.tsx`). `noindex` · `no-store`.
- 질문 내용 · 받는 사람 이름은 운영 데이터에만 둔다(이 저장소는 공개).

```bash
cat > "$OUT/q.json" <<'JSON'
{ "by": "claude", "ops": [
  { "op": "question.add", "to": "받는사람", "text": "물어볼 것" },
  { "op": "guest.add", "name": "받는사람" }
] }
JSON
node scripts/progress.mjs apply "$OUT/q.json" --dry-run && node scripts/progress.mjs apply "$OUT/q.json" --yes
node scripts/progress.mjs get    # [질문] · [손님 링크]에 id · 주소가 나온다
```
