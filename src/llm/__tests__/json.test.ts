import { describe, expect, it } from 'vitest';

import { safeExtractJson } from '../json';

describe('safeExtractJson', () => {
  it('parses valid direct JSON object', () => {
    const result = safeExtractJson<{ act: string }>('{"act": "REPEAT_STEP"}');
    expect(result).toEqual({ act: 'REPEAT_STEP' });
  });

  it('parses valid direct JSON array', () => {
    const result = safeExtractJson<string[]>('["step 1", "step 2"]');
    expect(result).toEqual(['step 1', 'step 2']);
  });

  it('strips markdown codeblock fences', () => {
    const markdown = '```json\n{\n  "title": "Pasta",\n  "steps": []\n}\n```';
    const result = safeExtractJson<{ title: string; steps: unknown[] }>(markdown);
    expect(result).toEqual({ title: 'Pasta', steps: [] });
  });

  it('handles conversational prefix and suffix around JSON', () => {
    const content =
      'Sure! Here is the JSON payload:\n{"act": "HELP"}\nLet me know if you need anything else.';
    const result = safeExtractJson<{ act: string }>(content);
    expect(result).toEqual({ act: 'HELP' });
  });

  it('returns null for empty, whitespace, or invalid content', () => {
    expect(safeExtractJson('')).toBeNull();
    expect(safeExtractJson('   ')).toBeNull();
    expect(safeExtractJson('not a json object')).toBeNull();
  });
});
