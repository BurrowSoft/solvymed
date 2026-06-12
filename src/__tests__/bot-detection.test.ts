import { describe, it, expect } from 'vitest';

// Regex extracted from src/middleware.ts
const BOT_RE = /googlebot|bingbot|yandexbot|baiduspider|applebot|facebookexternalhit|twitterbot/i;

function isBot(ua: string) {
  return BOT_RE.test(ua);
}

describe('bot detection', () => {
  it('detects Googlebot', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
  });

  it('detects Bingbot', () => {
    expect(isBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(true);
  });

  it('detects Yandexbot', () => {
    expect(isBot('Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)')).toBe(true);
  });

  it('detects Baiduspider', () => {
    expect(isBot('Baiduspider+(+http://www.baidu.com/search/spider.htm)')).toBe(true);
  });

  it('detects Applebot', () => {
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 8_1 like Mac OS X) AppleBot/0.1')).toBe(true);
  });

  it('detects facebookexternalhit', () => {
    expect(isBot('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true);
  });

  it('detects Twitterbot', () => {
    expect(isBot('Twitterbot/1.0')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBot('GOOGLEBOT/2.1')).toBe(true);
    expect(isBot('googlebot/2.1')).toBe(true);
  });

  it('does NOT flag Chrome', () => {
    expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36')).toBe(false);
  });

  it('does NOT flag Firefox', () => {
    expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0')).toBe(false);
  });

  it('does NOT flag Safari', () => {
    expect(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Safari/604.1')).toBe(false);
  });

  it('does NOT flag an empty user-agent string', () => {
    expect(isBot('')).toBe(false);
  });

  it('does NOT flag curl', () => {
    expect(isBot('curl/7.88.1')).toBe(false);
  });
});
