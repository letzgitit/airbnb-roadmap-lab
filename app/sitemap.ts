import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  // 최종 주소가 정해지기 전에는 비워 둔다(잘못된 주소를 알리지 않기 위해)
  if (!base) return [];
  return [{ url: base.replace(/\/$/, '') + '/', changeFrequency: 'weekly', priority: 1 }];
}
