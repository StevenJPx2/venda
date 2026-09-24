import { describe, expect, it } from 'vitest';
import { extractJson, migrationsUpToDate, parseD1List, parseDeployUrl, parseKvList, parseR2List, parseWhoami, stripAnsi } from '../src/wrangler.js';

describe('Wrangler output parsing', () => {
  it('extracts JSON after Wrangler banners', () => {
    expect(extractJson('☁ Wrangler output\n[{"uuid":"db-id"}]')).toEqual([{ uuid: 'db-id' }]);
    expect(parseWhoami('{"loggedIn":true,"email":"admin@example.com","accounts":[{"id":"a1","name":"Main"}]}')).toEqual({
      loggedIn: true, email: 'admin@example.com', accounts: [{ id: 'a1', name: 'Main' }]
    });
  });

  it('parses D1, KV and R2 resource listings', () => {
    expect(parseD1List('[{"name":"cms-content","uuid":"d1-id"}]')).toEqual([{ name: 'cms-content', id: 'd1-id' }]);
    expect(parseKvList('[{"title":"cms-cache","id":"kv-id"}]')).toEqual([{ title: 'cms-cache', id: 'kv-id' }]);
    expect(parseR2List('Listing buckets...\nname:           cms-media\ncreation_date: today')).toEqual(['cms-media']);
  });

  it('normalizes deployment URLs and migration status', () => {
    expect(parseDeployUrl('Published venda https://cms.account.workers.dev')).toBe('https://cms.account.workers.dev');
    expect(parseDeployUrl('Published', 'cms.example.com')).toBe('https://cms.example.com');
    expect(migrationsUpToDate('No migrations to apply.')).toBe(true);
    expect(migrationsUpToDate('Applying migration 0001_initial.sql')).toBe(false);
    expect(stripAnsi('\u001b[31merror\u001b[0m')).toBe('error');
  });
});
