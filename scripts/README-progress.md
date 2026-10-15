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
    { "op": "task.add", "stepId": 2, "text": "구청 담당자에게 전화하기", "due": "2026-10-25" },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "baseVersion": 1, "patch": { "text": "구청 전화(오후)", "due": "2026-10-26" } },
    { "op": "task.update", "id": "t_xxxxxxxxxxxx", "patch": { "done": true } },
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
| `task.add` | `stepId`(1~14), `text`(1~200자) | `due`: `YYYY-MM-DD` 또는 null |
| `task.update` | `id`, `patch` | `patch`: `text` `due` `stepId`(단계 이동) `done`. **`done`만 바꿀 땐 `baseVersion` 불필요**, 그 밖엔 필수 |
| `task.delete` / `task.restore` | `id` | 소프트 삭제(30일 보관 후 정리) |
| `step.update` | `stepId`, `baseVersion`, `patch` | `patch`: `status`(`todo` `doing` `done`) `targetDate` `note`(≤1000자). 아직 한 번도 안 고친 단계의 version은 0 |
| `log.add` | `kind`(`결정` `통화` `일정` `메모`), `text`(≤1000자) | 「현황 메모/결정 기록」 |
| `log.update` / `log.delete` / `log.restore` | `id` (+`baseVersion`, `patch`) | |
| `property.add` | `label`(≤40자), `value`(≤300자) | 매물 기본 정보(자유 key-value) |
| `property.update` / `property.delete` / `property.restore` | `id` (+`baseVersion`, `patch`) | |

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

## export-md

`export-md <out.md>`는 진행률, 매물 정보, 단계별 상태·목표일·메모, 할 일(미완료 먼저·마감일 순, 완료는 `<details>`로 접음), 최근 기록 20건, 마지막 동기화 시각을 씁니다. 맨 위에 「자동 생성 — 직접 고치지 말 것」 경고가 붙습니다. 🔴 이 저장소는 GitHub 공개 저장소라, 출력 경로가 저장소 안이면서 git이 무시하지 않는 곳이면 거부합니다(볼트 등 저장소 밖에 쓰세요). 할 일 줄은 `- [ ]`가 아니라 `- ☐` / `- ☑`입니다(볼트 Todoist 플러그인이 체크박스를 흡수하므로).

## 초기 데이터

`node scripts/seed-progress.mjs scripts/seed-example.json [--force] [--yes]` — 가짜 예시 데이터를 저장소에 넣습니다(저장소가 비어 있을 때만, `--force`는 지우고 다시, 원격(운영)이면 `--yes`도 필요). 실제 개인 정보는 이 파일에 넣지 마세요.
