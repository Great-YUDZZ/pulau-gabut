// Universal Synced Lyrics Engine (LRCLIB Integration)
import { LyricLine } from './types';

// In-memory cache for fetched lyrics to minimize network requests
const lyricsCache = new Map<string, LyricLine[]>();

// Clean track title (strip out feat, official video, remastered, etc.)
export const cleanTrackTitle = (title: string): string => {
  return title
    .replace(/\s*[\(\[](feat\.|ft\.|official|audio|video|remastered|lyrics|mv)[\)\]].*$/i, '')
    .replace(/\s*[\(\[].*?(feat|ft).*?[\)\]]/gi, '')
    .trim();
};

// Clean artist name (take primary artist before &, feat, ft, comma)
export const cleanArtistName = (artist: string): string => {
  return artist
    .split(/&|,|\bfeat\b|\bft\b/i)[0]
    .trim();
};

// Parse standard LRC format ([mm:ss.xx] Lyric text) into sorted array
export const parseLRC = (lrcText: string): LyricLine[] => {
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;

  for (const rawLine of lines) {
    const match = regex.exec(rawLine);
    if (match) {
      const minutes = parseFloat(match[1]);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) {
        result.push({
          time: minutes * 60 + seconds,
          text
        });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
};

// Fetch synchronized lyrics from LRCLIB
export const fetchLyrics = async (
  rawTitle: string,
  rawArtist: string,
  duration?: number
): Promise<LyricLine[] | null> => {
  if (!rawTitle || rawTitle === 'Spotify / YouTube Music' || rawTitle === 'Media Aktif') {
    return null;
  }

  const cleanTitle = cleanTrackTitle(rawTitle);
  const cleanArtist = cleanArtistName(rawArtist);
  const cacheKey = `${cleanTitle.toLowerCase()}||${cleanArtist.toLowerCase()}`;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  try {
    // 1. Try exact match first
    let queryUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (duration && duration > 0) {
      queryUrl += `&duration=${Math.round(duration)}`;
    }

    let res = await fetch(queryUrl);
    let data = res.ok ? await res.json() : null;

    // 2. Fallback to search query if exact match not found
    if (!data?.syncedLyrics) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;
      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) {
        const searchResults = await searchRes.json();
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          // Find first result with syncedLyrics
          const withSync = searchResults.find(item => item.syncedLyrics);
          data = withSync || searchResults[0];
        }
      }
    }

    if (data?.syncedLyrics) {
      const parsed = parseLRC(data.syncedLyrics);
      if (parsed.length > 0) {
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }

    // 3. Fallback to plain lyrics if synced not available
    if (data?.plainLyrics) {
      const plainLines: LyricLine[] = data.plainLyrics
        .split('\n')
        .map((text: string) => text.trim())
        .filter((text: string) => Boolean(text))
        .map((text: string, index: number) => ({
          time: index * 4, // estimate 4s per line as rough fallback
          text
        }));
      if (plainLines.length > 0) {
        lyricsCache.set(cacheKey, plainLines);
        return plainLines;
      }
    }
  } catch (err) {
    console.warn('LRCLIB fetch error:', err);
  }

  return null;
};
