import 'server-only';
import { readContent } from './core/content-read.ts';
import type { Content } from './core/types.ts';

export function loadContent(): Content {
  return readContent();
}
