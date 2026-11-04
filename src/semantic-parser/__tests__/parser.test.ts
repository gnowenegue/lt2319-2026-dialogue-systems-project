import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { getLlmUsageHistory } from '../../llm';
import { DIALOGUE_ACTS } from '../constants';
import {
  buildUserPrompt,
  cleanEntities,
  extractJsonPayload,
  isDialogueAct,
  normalizeParseResult,
  parseUtterance,
} from '../parser';

describe('Semantic Parser - Pure Parsing and Normalization Helpers', () => {
  describe('isDialogueAct', () => {
    it('returns true for all canonical dialogue acts', () => {
      DIALOGUE_ACTS.forEach((act) => {
        expect(isDialogueAct(act)).toBe(true);
      });
    });

    it('returns false for invalid acts, numbers, and objects', () => {
      expect(isDialogueAct('NOT_AN_ACT')).toBe(false);
      expect(isDialogueAct('')).toBe(false);
      expect(isDialogueAct(123)).toBe(false);
      expect(isDialogueAct(null)).toBe(false);
      expect(isDialogueAct(undefined)).toBe(false);
      expect(isDialogueAct({ act: 'NEXT_STEP' })).toBe(false);
    });
  });

  describe('buildUserPrompt', () => {
    it('formats a clean prompt when no prior messages or state are provided', () => {
      const prompt = buildUserPrompt('next step');
      expect(prompt).toBe('Target utterance to parse:\n"next step"');
    });

    it('formats conversation context prefix from prior messages', () => {
      const prompt = buildUserPrompt(
        'yes please',
        [
          { role: 'assistant', content: 'Ready for step 1?' },
          { role: 'user', content: 'hold on' },
        ],
        undefined,
      );

      expect(prompt).toContain(
        'Recent conversation context:\nAssistant: Ready for step 1?\nUser: hold on\n\n',
      );
      expect(prompt).toContain('Target utterance to parse:\n"yes please"');
    });

    it('includes active dialogue phase and expected intent suggestions', () => {
      const prompt = buildUserPrompt('two', undefined, 'SelectingRecipe');
      expect(prompt).toContain(
        'Active dialogue phase: SelectingRecipe (likely intents: SELECT_RECIPE, SEARCH_RECIPE, DENY, HELP)\n\n',
      );
      expect(prompt).toContain('Target utterance to parse:\n"two"');
    });

    it('formats state hint cleanly for unknown phase names without expected acts', () => {
      const prompt = buildUserPrompt('pause', undefined, 'CustomPhase');
      expect(prompt).toContain('Active dialogue phase: CustomPhase\n\n');
    });
  });

  describe('extractJsonPayload', () => {
    it('parses standard JSON string', () => {
      const result = extractJsonPayload('{"act": "NEXT_STEP"}');
      expect(result).toEqual({ act: 'NEXT_STEP' });
    });

    it('extracts JSON surrounded by markdown code fences', () => {
      const markdown =
        '```json\n{\n  "act": "SEARCH_RECIPE",\n  "entities": { "query": "pizza" }\n}\n```';
      const result = extractJsonPayload(markdown);
      expect(result).toEqual({
        act: 'SEARCH_RECIPE',
        entities: { query: 'pizza' },
      });
    });

    it('extracts JSON when surrounded by commentary text', () => {
      const text = 'Here is the parsed intent: {"act": "AFFIRM"} Hope this helps!';
      const result = extractJsonPayload(text);
      expect(result).toEqual({ act: 'AFFIRM' });
    });

    it('safely parses JSON when commentary contains extra curly braces', () => {
      const text = 'Result: {"act": "NEXT_STEP"} (note: {debug: true} is discarded)';
      const result = extractJsonPayload(text);
      expect(result).toEqual({ act: 'NEXT_STEP' });
    });

    it('returns empty object when content is empty or invalid JSON', () => {
      expect(extractJsonPayload('')).toEqual({});
      expect(extractJsonPayload('   ')).toEqual({});
      expect(extractJsonPayload('This is not json at all.')).toEqual({});
    });
  });

  describe('cleanEntities', () => {
    it('parses and trims valid entity slots', () => {
      const raw = {
        ingredient: '  garlic  ',
        stepNumber: '3',
        query: '  how much salt?  ',
        durationSeconds: '300',
        timerLabel: '  pasta  ',
      };

      const cleaned = cleanEntities(raw);
      expect(cleaned).toEqual({
        ingredient: 'garlic',
        stepNumber: 3,
        query: 'how much salt?',
        durationSeconds: 300,
        timerLabel: 'pasta',
      });
    });

    it('rounds numeric values and handles integer step indicators', () => {
      const raw = {
        stepNumber: -1,
        durationSeconds: 45.6,
      };

      const cleaned = cleanEntities(raw);
      expect(cleaned).toEqual({
        stepNumber: -1,
        durationSeconds: 46,
      });
    });

    it('ignores NaN and empty strings, omitting undefined fields', () => {
      const raw = {
        ingredient: '   ',
        stepNumber: 'invalid_number',
        query: 'valid query',
        durationSeconds: undefined,
      };

      const cleaned = cleanEntities(raw);
      expect(cleaned).toEqual({
        query: 'valid query',
      });
      expect(Object.keys(cleaned ?? {})).toEqual(['query']);
    });

    it('returns undefined when all fields are empty or invalid', () => {
      expect(cleanEntities({})).toBeUndefined();
      expect(cleanEntities(null)).toBeUndefined();
      expect(cleanEntities(undefined)).toBeUndefined();
      expect(cleanEntities({ ingredient: '  ', stepNumber: 'not-a-number' })).toBeUndefined();
    });
  });

  describe('normalizeParseResult', () => {
    it('synthesizes query from utterance when omitted for acts requiring query', () => {
      const result = normalizeParseResult(
        'INQUIRE_SUBSTITUTION',
        { ingredient: 'butter' },
        'can I use oil?',
      );
      expect(result).toEqual({
        act: 'INQUIRE_SUBSTITUTION',
        entities: {
          ingredient: 'butter',
          query: 'can I use oil?',
        },
      });
    });

    it('preserves existing query for acts requiring query', () => {
      const result = normalizeParseResult(
        'SEARCH_RECIPE',
        { query: 'banana bread' },
        'search for banana bread please',
      );
      expect(result).toEqual({
        act: 'SEARCH_RECIPE',
        entities: { query: 'banana bread' },
      });
    });

    it('does not synthesize query for navigation or timer acts', () => {
      const result = normalizeParseResult('NEXT_STEP', undefined, 'what is next');
      expect(result).toEqual({
        act: 'NEXT_STEP',
      });
      expect(result.entities).toBeUndefined();
    });
  });
});

describe('Semantic Parser - parseUtterance Orchestration', () => {
  it('returns UNKNOWN immediately without invoking OpenAI for empty input', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    const result = await parseUtterance('   ', {
      client: mockClient as unknown as OpenAI,
    });

    expect(result).toEqual({ act: 'UNKNOWN', utterance: '' });
    expect(mockClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it('parses valid utterance into dialogue act and cleaned entities', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    act: 'SET_TIMER',
                    entities: { durationSeconds: 600, timerLabel: 'potatoes' },
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
          }),
        },
      },
    };

    const result = await parseUtterance('set a timer for 10 minutes for potatoes', {
      client: mockClient as unknown as OpenAI,
      currentState: 'WaitingForStepCommand',
    });

    expect(result).toEqual({
      act: 'SET_TIMER',
      entities: {
        durationSeconds: 600,
        timerLabel: 'potatoes',
      },
      utterance: 'set a timer for 10 minutes for potatoes',
    });

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    );
  });

  it('falls back to UNKNOWN act when model returns an unrecognized intent', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({ act: 'PLAY_MUSIC' }),
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
          }),
        },
      },
    };

    const result = await parseUtterance('play jazz', {
      client: mockClient as unknown as OpenAI,
    });

    expect(result.act).toBe('UNKNOWN');
    expect(result.utterance).toBe('play jazz');
  });

  it('handles OpenAI API errors gracefully with fallback to UNKNOWN', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        },
      },
    };

    const result = await parseUtterance('what is next', {
      client: mockClient as unknown as OpenAI,
    });

    expect(result).toEqual({
      act: 'UNKNOWN',
      utterance: 'what is next',
    });
  });

  it('records LLM token usage metrics upon completion', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({ act: 'NEXT_STEP' }),
                },
              },
            ],
            usage: { prompt_tokens: 25, completion_tokens: 6, total_tokens: 31 },
          }),
        },
      },
    };

    await parseUtterance('done with this', {
      client: mockClient as unknown as OpenAI,
      model: 'test-model',
    });

    const history = getLlmUsageHistory();
    const lastRecord = history[history.length - 1];
    expect(lastRecord?.call).toBe('semantic-parser');
    expect(lastRecord?.model).toBe('test-model');
    expect(lastRecord?.totalTokens).toBe(31);
  });
});
