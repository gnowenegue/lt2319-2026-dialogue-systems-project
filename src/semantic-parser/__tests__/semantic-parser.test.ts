import { describe, expect, it } from 'vitest';
import { normalizeParseResult } from '../parser';

describe('normalizeParseResult', () => {
  it('normalizes prep-skipping utterances to SKIP_PREP when classified as AFFIRM', () => {
    const utterances = [
      "Actually, I have everything. Let's start cooking",
      'I have everything',
      'I got everything',
      'I have all ingredients',
      'have all of them',
      "let's start cooking",
      'start cooking',
      'skip prep',
      'skip ingredients',
      'ready to cook',
    ];

    for (const utterance of utterances) {
      const result = normalizeParseResult('AFFIRM', undefined, utterance);
      expect(result.act).toBe('SKIP_PREP');
    }
  });

  it('normalizes prep-skipping utterances to SKIP_PREP when classified as UNKNOWN', () => {
    const result = normalizeParseResult(
      'UNKNOWN',
      undefined,
      "Actually, I have everything. Let's start cooking",
    );
    expect(result.act).toBe('SKIP_PREP');
  });

  it('preserves AFFIRM for standard batch confirmations', () => {
    const batchConfirmations = ['got it', 'got them', 'yes', 'sure', 'I have those', 'got those'];

    for (const utterance of batchConfirmations) {
      const result = normalizeParseResult('AFFIRM', undefined, utterance);
      expect(result.act).toBe('AFFIRM');
    }
  });

  it('resolves relative last step to -1 when entities are missing', () => {
    const lastStepUtterances = [
      'Can we go to the last step?',
      'jump to the final step',
      'take me to the last step',
      'go to the end',
    ];

    for (const utterance of lastStepUtterances) {
      const result = normalizeParseResult('GOTO_STEP', undefined, utterance);
      expect(result.act).toBe('GOTO_STEP');
      expect(result.entities?.stepNumber).toBe(-1);
    }
  });

  it('resolves relative first step to 1 when entities are missing', () => {
    const result = normalizeParseResult('GOTO_STEP', undefined, 'go to the first step');
    expect(result.act).toBe('GOTO_STEP');
    expect(result.entities?.stepNumber).toBe(1);
  });

  it('extracts numerical step number from utterance when entities are missing', () => {
    const result = normalizeParseResult('GOTO_STEP', undefined, 'jump to step 4');
    expect(result.act).toBe('GOTO_STEP');
    expect(result.entities?.stepNumber).toBe(4);
  });

  it('preserves existing explicit stepNumber entity', () => {
    const result = normalizeParseResult('GOTO_STEP', { stepNumber: 3 }, 'jump to step 3');
    expect(result.act).toBe('GOTO_STEP');
    expect(result.entities?.stepNumber).toBe(3);
  });

  it('recovers GOTO_STEP when classified as UNKNOWN', () => {
    const result = normalizeParseResult('UNKNOWN', undefined, 'Can we go to the last step?');
    expect(result.act).toBe('GOTO_STEP');
    expect(result.entities?.stepNumber).toBe(-1);
  });
});
