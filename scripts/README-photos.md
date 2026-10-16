# 사진 CLI (`scripts/photos.mjs`)

「집 정보 · 기록」 창의 「사진」 탭과 단계 창의 사진 줄에 보이는 사진 · PDF를 터미널에서 올리고 · 보고 · 지웁니다. 사이트 API와 같은 처리(`lib/core/photos.ts`)를 씁니다.

- 🔴 사진과 설명(주소 · 이름 · 계약서 내용)은 **이 공개 저장소에 두지 않습니다.** 사진 파일 · manifest는 저장소 밖(볼트 · 스크래치패드)에 두고, 저장은 운영 Upstash에만 합니다.
- 저장소 고르기 · 운영 키 다루기는 `progress.mjs`와 같습니다(`README-progress.md` 맨 위). 키가 없으면 로컬 `.data/photos/`(git 무시)에 씁니다. 어느 저장소인지 stderr 첫 줄 `[저장소] …`에 나옵니다.
- 🔴 원격(운영)에 쓰는 명령(`add` · `add-manifest` · `delete` · `restore`)은 `--yes`가 있어야 씁니다. 없으면 요약만 보여 주고 종료 코드 3으로 멈춥니다. 모르는 옵션은 실행하지 않고 멈춥니다.

## 명령

```bash
node scripts/photos.mjs list [--json]
node scripts/photos.mjs add --step 3 a.jpg b.jpg [--album "묶음 이름"] [--caption "설명"] [--doc] [--original-url <주소>] [--yes]
node scripts/photos.mjs add-manifest /저장소/밖/manifest.json [--yes]
node scripts/photos.mjs delete <id> [--purge] [--yes]     # 기본은 삭제 표시(30일 동안 사이트에서 복원 가능), --purge 는 바로 완전히 지움
node scripts/photos.mjs restore <id> [--yes]
```

manifest(파일 경로는 manifest 파일 기준 상대 경로 또는 절대 경로):

```json
{ "by": "claude", "items": [
  { "step": 1, "album": "집 사진", "file": "photos/1.jpg", "caption": "주방" },
  { "step": 3, "album": "계약서", "file": "docs/contract.pdf", "caption": "계약서", "doc": true }
] }
```

## 묶는 방식

- 사진은 타임라인 **단계(1~14, 필수)**로 묶습니다. 사진 탭은 단계 순서대로(사진 없는 단계는 숨김), 단계 안은 찍은 날짜 순입니다. 단계 이름은 공개 콘텐츠의 단계를 그대로 씁니다.
- `album`은 선택인 작은 묶음 이름입니다(크게 보기에 함께 보임).
- 찍은 시각: 메타데이터를 버리기 전에 EXIF 찍은 시각(DateTimeOriginal)을 읽고, 없으면 파일 수정 시각(CLI) · 올린 시각(사이트)을 한국 시각으로 씁니다.
- 사이트에서 사진마다 단계 · 설명을 나중에 고칠 수 있습니다.

- 순서: 단계 → 직접 바꾼 순서(`position`, 크게 보기의 「앞으로 · 뒤로」) → 찍은 시각 → 올린 순서. `position`이 없는 사진(기존 · 새로 올린 것)은 같은 단계의 position 있는 사진 뒤에 찍은 시각 순으로 붙습니다. `list`도 같은 순서입니다(`lib/core/photo-order.ts`).

## 처리 방식

- 사진: EXIF 회전을 픽셀에 반영한 뒤 메타데이터(GPS · 기종 · 찍은 시각)를 모두 버리고 JPEG로 다시 저장합니다. 큰 사진은 긴 변 1600px(약 500KB 안쪽), 목록용은 400px.
- `--doc`(사이트에서는 「글씨 많은 문서」): 큰 사진을 긴 변 2400px(약 900KB 안쪽)로 저장해 작은 글씨가 읽히게 합니다.
- PDF: 원본(4MB까지)을 그대로 저장하고, CLI는 첫 쪽을 `pdftoppm`(없으면 `sips`)으로 그려 미리보기(문서 모드)를 만듭니다. 사이트에서 올린 PDF는 미리보기 없이 PDF 칸으로 보입니다. 「PDF 열기」로 원본을 엽니다.
- 원본 보기: 구글 드라이브(데스크톱) 안의 파일을 올리면 파일의 드라이브 id(`xattr com.google.drivefs.item-id#S`)로 `https://drive.google.com/file/d/<id>/view` 를 자동으로 붙입니다(30초까지 기다리고, 없으면 건너뜀). 드라이브 권한이 있는 사람만 열립니다. `--original-url`로 직접 줄 수도 있습니다.
- HEIC: 서버의 sharp가 HEIC를 못 읽으면 「JPEG로 바꿔 올려 주세요」 안내로 거절합니다.

## 저장 위치(Redis)

- `oedomin:photos:meta` — 해시. 필드 = 사진 id(`ph_…`), 값 = 정보 JSON(단계 · 찍은 시각 · 묶음 이름 · 설명 · 크기 · 순서 · 올린 사람 · 삭제 표시 · 원본 주소).
- `oedomin:photo:<id>:<full|thumb|file>:<n>` — base64 조각(하나에 약 700KB 이하).
- 현황 키(`oedomin:progress:v1`)는 건드리지 않습니다.

사이트 API: `GET /api/photos`(목록), `GET /api/photos/<id>?size=thumb|full|file`(바이트), `POST /api/photos`(multipart 한 장), `PATCH`(단계 · 설명 · 묶음 이름 · 복원), `DELETE`(삭제 표시). 전부 로그인한 허용 계정만(아니면 401/403), 응답은 `Cache-Control: private, no-store`.
