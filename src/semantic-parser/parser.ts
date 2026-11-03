import { ACTIVE_LLM_MODEL, openai } from '../llm';
import prompts from '../prompts';
import { DIALOGUE_ACTS, SEMANTIC_PARSER_TEMPERATURE } from './constants';
import type { DialogueAct, Entities, ParserOptions, SemanticParseResult } from './types';

// regex patterns detecting prep-skip cues and relative step navigation
const SKIP_PREP_REGEX =
  /\b(have everything|got everything|have all( of)?( them| the ingredients)?|start cooking|let's cook|skip prep|skip ingredients|ready to cook)\b/i;
const LAST_STEP_REGEX = /\b(last|final|end)\s*(step)?\b/i;
const FIRST_STEP_REGEX = /\bfirst\s*(step)?\b/i;
const STEP_NUMBER_REGEX = /\bstep\s*(\d+)\b/i;

/**
 * normalizes semantic parse results with deterministic fallback rules for prep-skipping and relative step navigation
 */
export const normalizeParseResult = (
  rawAct: DialogueAct,
  rawEntities: Entities | undefined,
  utterance: string,
): { act: DialogueAct; entities?: Entities } => {
  let act = rawAct;
  let entities = rawEntities;

  // normalize prep-skipping cues misclassified as `AFFIRM` or `UNKNOWN`
  if ((act === 'AFFIRM' || act === 'UNKNOWN') && SKIP_PREP_REGEX.test(utterance)) {
    act = 'SKIP_PREP';
  }

  // recover step navigation cues misclassified as `UNKNOWN`
  if (
    act === 'UNKNOWN' &&
    /\b(go to|jump to|take me to|navigate to)\s*(the\s*)?(last|final|end|first|step\s*\d+)/i.test(
      utterance,
    )
  ) {
    act = 'GOTO_STEP';
  }

  // resolve missing step numbers for `GOTO_STEP` navigation
  if (act === 'GOTO_STEP' && entities?.stepNumber === undefined) {
    if (LAST_STEP_REGEX.test(utterance)) {
      entities = { ...entities, stepNumber: -1 };
    } else if (FIRST_STEP_REGEX.test(utterance)) {
      entities = { ...entities, stepNumber: 1 };
    } else {
      const match = utterance.match(STEP_NUMBER_REGEX);
      if (match?.[1]) {
        entities = { ...entities, stepNumber: Number(match[1]) };
      }
    }
  }

  return { act, entities };
};

/**
 * runtime type guard validating whether a value matches a supported `DialogueAct`
 */
export const isDialogueAct = (act: unknown): act is DialogueAct =>
  typeof act === 'string' && (DIALOGUE_ACTS as readonly string[]).includes(act);

/**
 * parses structured dialogue act and entities from recognized speech using Groq.
 * parses JSON directly with graceful fallback to `UNKNOWN` on error or empty input.
 */
export const parseUtterance = async (
  utterance: string,
  options: ParserOptions = {},
): Promise<SemanticParseResult> => {
  const trimmed = utterance.trim();
  if (!trimmed) {
    return { act: 'UNKNOWN', utterance: '' };
  }

  const client = options.client ?? openai;
  const model = options.model ?? ACTIVE_LLM_MODEL;

  try {
    const historyMessages =
      options.recentMessages?.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })) ?? [];

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompts.semanticParser },
        ...historyMessages,
        { role: 'user', content: trimmed },
      ],
      response_format: { type: 'json_object' },
      temperature: SEMANTIC_PARSER_TEMPERATURE,
    });

    const content = completion.choices[0]?.message?.content ?? '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    const rawAct = isDialogueAct(parsed.act) ? parsed.act : 'UNKNOWN';
    const rawEntities =
      typeof parsed.entities === 'object' && parsed.entities !== null ? parsed.entities : undefined;

    const parsedEntities: Entities | undefined = rawEntities
      ? {
          ingredient:
            typeof rawEntities.ingredient === 'string' ? rawEntities.ingredient.trim() : undefined,
          stepNumber:
            rawEntities.stepNumber !== undefined && !Number.isNaN(Number(rawEntities.stepNumber))
              ? Number(rawEntities.stepNumber)
              : undefined,
          query: typeof rawEntities.query === 'string' ? rawEntities.query.trim() : undefined,
          durationSeconds:
            rawEntities.durationSeconds !== undefined &&
            !Number.isNaN(Number(rawEntities.durationSeconds))
              ? Number(rawEntities.durationSeconds)
              : undefined,
          timerLabel:
            typeof rawEntities.timerLabel === 'string' ? rawEntities.timerLabel.trim() : undefined,
        }
      : undefined;

    const { act, entities } = normalizeParseResult(rawAct, parsedEntities, trimmed);

    return {
      act,
      entities,
      utterance: trimmed,
    };
  } catch (error) {
    console.error('[SemanticParser] Parse error:', error);
    const { act, entities } = normalizeParseResult('UNKNOWN', undefined, trimmed);
    return { act, entities, utterance: trimmed };
  }
};
