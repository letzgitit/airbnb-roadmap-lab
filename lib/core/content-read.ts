import fs from 'node:fs';
import path from 'node:path';
import type { Content, ScriptItem, Step, UpdateItem } from './types.ts';

// 파일별로 content/ 에 있으면 그걸, 없으면 fixtures/content-sample/ 을 읽는다. (읽기만)
function load<T>(name: string): T {
  const root = process.cwd();
  const real = path.join(root, 'content', name);
  const sample = path.join(root, 'fixtures', 'content-sample', name);
  const file = fs.existsSync(real) ? real : sample;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function readContent(): Content {
  const steps = load<Step[]>('steps.json').slice().sort((a, b) => a.id - b.id);
  return {
    steps: steps.map((s) => ({
      ...s,
      official: s.official ?? [], tips: s.tips ?? [], community: s.community ?? [],
      checklist: s.checklist ?? [], warnings: s.warnings ?? [],
    })),
    scripts: load<ScriptItem[]>('scripts.json'),
    updates: load<UpdateItem[]>('updates.json'),
  };
}
