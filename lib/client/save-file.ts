// 사진 · 문서 받기(브라우저 전용). 원본을 fetch → Blob → File 로 만들어 이름을 붙인다.
// 폰(터치 기기)에서 파일 공유가 되면 공유 시트(「이미지 저장」으로 사진 앱에 넣을 수 있다), 아니면 <a download>.
export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export class SaveError extends Error {}

function touchDevice(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

function anchorDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function saveFile(url: string, name: string, mime: string, headers?: Record<string, string>): Promise<SaveResult> {
  let blob: Blob;
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers });
    if (!res.ok) throw new SaveError(`status ${res.status}`);
    blob = await res.blob();
  } catch {
    throw new SaveError('fetch');
  }
  const file = new File([blob], name, { type: mime });
  if (touchDevice() && typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';   // 사용자가 시트를 닫음
      // 그 밖(받는 사이 터치 허용 시간이 지난 NotAllowedError 등)은 아래 내려받기로 이어 간다
    }
  }
  anchorDownload(file, name);
  return 'downloaded';
}
