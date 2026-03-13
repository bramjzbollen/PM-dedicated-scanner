import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface BavoNewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  topic: string;
  lang: 'nl' | 'en';
  publishedAt: string;
  breaking?: boolean;
}

// In-memory cache
let cachedItems: BavoNewsItem[] = [];
let cachedBreaking: BavoNewsItem | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface BavoFetchResult {
  breaking: BavoNewsItem | null;
  items: BavoNewsItem[];
}

/**
 * Reads Bavo's news log from public/bavo-news.json
 * 
 * Expected format:
 * {
 *   "items": [
 *     { "id": "1", "title": "...", "source": "...", "url": "...", "topic": "tech|crypto|marketing|f1|business", "lang": "nl|en", "publishedAt": "ISO", "breaking": false }
 *   ]
 * }
 * 
 * Bavo writes to this file 2x daily. Dashboard reads it.
 */
async function fetchFromBavoFile(): Promise<BavoFetchResult> {
  const filePath = join(process.cwd(), 'public', 'bavo-news.json');
  
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const allItems: BavoNewsItem[] = (data.items || data || []).map((item: BavoNewsItem, idx: number) => ({
      ...item,
      id: item.id || `bavo-${idx}`,
    }));

    // Sort by publishedAt descending
    allItems.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    // Separate breaking from regular
    const breaking = allItems.find((item) => item.breaking) || null;
    const regular = allItems.filter((item) => !item.breaking).slice(0, 5);

    return { breaking, items: regular };
  } catch (err: unknown) {
    // File doesn't exist yet — return empty (Bavo hasn't started logging)
    const message = err instanceof Error ? err.message : '';
    if (message.includes('ENOENT')) {
      return { breaking: null, items: [] };
    }
    throw err;
  }
}

export async function GET() {
  const now = Date.now();

  if (cachedItems.length === 0 || now - lastFetchedAt > CACHE_TTL_MS) {
    try {
      const result = await fetchFromBavoFile();
      cachedBreaking = result.breaking;
      cachedItems = result.items.slice(0, 5);
      lastFetchedAt = now;
    } catch (error) {
      console.error('[bavo-news] Fetch failed:', error);
      if (cachedItems.length > 0) {
        return NextResponse.json({ breaking: cachedBreaking, items: cachedItems, stale: true });
      }
      return NextResponse.json({
        breaking: null,
        items: [],
        error: 'Bavo news file not found. Waiting for first log...',
        hint: 'Bavo should write to public/bavo-news.json',
      });
    }
  }

  return NextResponse.json({ breaking: cachedBreaking, items: cachedItems });
}
