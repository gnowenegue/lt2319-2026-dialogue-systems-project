import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { extractDialogueActAndEntities } from '../extractor';

describe('extractDialogueActAndEntities', () => {
  it('returns UNKNOWN immediately without invoking LLM if utterance is empty or whitespace', async () => {
    const mockCreate = vi.fn();
    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities('   ', {
      client: mockClient,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.act).toBe('UNKNOWN');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('correctly parses valid JSON response from LLM into typed SemanticParseResult', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              act: 'INQUIRE_SUBSTITUTION',
              entities: {
                ingredient: 'heavy cream',
                candidateSubstitute: 'Greek yogurt',
              },
            }),
          },
        },
      ],
    });

    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities(
      'Can I use Greek yogurt instead of heavy cream?',
      {
        client: mockClient,
        model: 'openai/gpt-oss-20b',
      },
    );

    expect(result.act).toBe('INQUIRE_SUBSTITUTION');
    expect(result.entities?.ingredient).toBe('heavy cream');
    expect(result.entities?.candidateSubstitute).toBe('Greek yogurt');
  });

  it('handles malformed JSON syntax gracefully without throwing an uncaught exception', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Invalid JSON { act: ... broken',
          },
        },
      ],
    });

    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities('What is this?', {
      client: mockClient,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.act).toBe('UNKNOWN');
  });

  it('handles missing choices or empty content safely', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [],
    });

    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities('hello', {
      client: mockClient,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.act).toBe('UNKNOWN');
  });

  it('falls back to UNKNOWN when LLM returns an unsupported dialogue act string', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              act: 'ORDER_PIZZA_UNSUPPORTED',
              entities: { ingredient: 'cheese' },
            }),
          },
        },
      ],
    });

    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities('Order me a pizza', {
      client: mockClient,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.act).toBe('UNKNOWN');
    expect(result.entities?.ingredient).toBe('cheese');
  });

  it('safely handles non-object entities payload', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              act: 'NEXT_STEP',
              entities: 'none',
            }),
          },
        },
      ],
    });

    const mockClient = {
      chat: { completions: { create: mockCreate } },
    } as unknown as OpenAI;

    const result = await extractDialogueActAndEntities('Next step please', {
      client: mockClient,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.act).toBe('NEXT_STEP');
    expect(result.entities).toBeUndefined();
  });
});
