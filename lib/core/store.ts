import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';

export const PROGRESS_KEY = 'oedomin:progress:v1';

// 문서 전체를 문자열 하나로 읽고, 읽은 값이 그대로일 때만 쓰는(compare-and-set) 저장소.
export interface Store {
  kind: 'redis' | 'file';
  /** 어느 저장소인지 사람이 알아볼 이름(토큰 없음). 예: redis https://xxx.upstash.io / file .data/progress.json */
  label: string;
  read(): Promise<string | null>;
  cas(expected: string | null, next: string): Promise<boolean>;
}

// ARGV[1]=읽었던 값('' 은 키 없음), ARGV[2]=새 값.
// 이미 ARGV[2] 가 들어 있으면 성공으로 본다: 응답만 잃어버린 요청을 클라이언트가 재전송해도 같은 연산이 두 번 들어가지 않게.
const CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur ~= false and cur == ARGV[2] then return 1 end
if (cur == false and ARGV[1] == '') or (cur ~= false and cur == ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0`;

// 사진 저장소(lib/core/photos.ts)도 같은 env 규칙을 쓴다
export function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// @upstash/redis 는 HTTP 오류 때 메시지에 「command was: <요청 본문 전체>」를 붙인다.
// 여기선 본문 = 현황 문서 전체(주소·금액 등)라서, 그대로 두면 서버 로그·CLI 출력으로 개인정보가 샌다. 메시지를 잘라 다시 던진다.
export class StoreError extends Error {}
export function sanitize(e: unknown, what: string): StoreError {
  const msg = e instanceof Error ? e.message : String(e);
  const head = msg.split(/,? ?command was:/i)[0].slice(0, 200);
  return new StoreError(`저장소(redis) ${what} 실패: ${head}`);
}

function redisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'redis',
    label: `redis ${new URL(url).host}`,
    async read() {
      try {
        const v = await redis.get<string>(PROGRESS_KEY);
        return v === null || v === undefined ? null : String(v);
      } catch (e) { throw sanitize(e, '읽기'); }
    },
    async cas(expected, next) {
      try {
        const r = await redis.eval(CAS_LUA, [PROGRESS_KEY], [expected ?? '', next]);
        return Number(r) === 1;
      } catch (e) { throw sanitize(e, '쓰기'); }
    },
  };
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'progress.json');

let fileLock: Promise<unknown> = Promise.resolve();

function fileStore(): Store {
  return {
    kind: 'file',
    label: `file ${path.relative(process.cwd(), DATA_FILE) || DATA_FILE}`,
    async read() {
      try { return await fs.readFile(DATA_FILE, 'utf8'); } catch { return null; }
    },
    cas(expected, next) {
      // 단일 프로세스 개발용: 프로세스 안에서 직렬화한 뒤 값 비교 → 임시 파일 → 교체.
      const run = async () => {
        let cur: string | null = null;
        try { cur = await fs.readFile(DATA_FILE, 'utf8'); } catch { cur = null; }
        if (cur !== expected) return false;
        await fs.mkdir(DATA_DIR, { recursive: true });
        const tmp = `${DATA_FILE}.${process.pid}.tmp`;
        await fs.writeFile(tmp, next, 'utf8');
        await fs.rename(tmp, DATA_FILE);
        return true;
      };
      const p = fileLock.then(run, run);
      fileLock = p.catch(() => undefined);
      return p;
    },
  };
}

export function hasRedisEnv(): boolean {
  return redisEnv() !== null;
}

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const env = redisEnv();
  cached = env ? redisStore(env.url, env.token) : fileStore();
  return cached;
}
