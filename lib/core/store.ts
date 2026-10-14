import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';

export const PROGRESS_KEY = 'oedomin:progress:v1';

// 문서 전체를 문자열 하나로 읽고, 읽은 값이 그대로일 때만 쓰는(compare-and-set) 저장소.
export interface Store {
  kind: 'redis' | 'file';
  read(): Promise<string | null>;
  cas(expected: string | null, next: string): Promise<boolean>;
}

const CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
if (cur == false and ARGV[1] == '') or (cur ~= false and cur == ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0`;

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function redisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'redis',
    async read() {
      const v = await redis.get<string>(PROGRESS_KEY);
      return v === null || v === undefined ? null : String(v);
    },
    async cas(expected, next) {
      const r = await redis.eval(CAS_LUA, [PROGRESS_KEY], [expected ?? '', next]);
      return Number(r) === 1;
    },
  };
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'progress.json');

let fileLock: Promise<unknown> = Promise.resolve();

function fileStore(): Store {
  return {
    kind: 'file',
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

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const env = redisEnv();
  cached = env ? redisStore(env.url, env.token) : fileStore();
  return cached;
}
