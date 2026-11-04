import { speechstate } from 'speechstate';
import { assign, setup } from 'xstate';

import { settings } from '../configs';
import { DEFAULT_CONVERSATION_WINDOW, ROLES } from '../constants';
import prompts from '../prompts';
import type { NormalizedRecipe } from '../recipes/types';
import { timerActorLogic } from '../timers';
import { handleRecognised, speechActions } from './actions';
import {
  fetchRecipeLogic,
  queryKnowledgeLogic,
  queryStepDetailLogic,
  refineRecipeLogic,
} from './actors';
import { cookingGuards } from './guards';
import {
  formatCandidateUtterance,
  formatCheckTimerUtterance,
  formatDurationForSpeech,
  formatPrepBatchUtterance,
  formatStepUtterance,
  lookupIngredient,
  matchCandidate,
  prepareAssistantSpeech,
  resolveReturnState,
} from './helpers';
import type { CookingContext, CookingEvent, RecipeCandidate } from './types';

export { fetchRecipeLogic, queryKnowledgeLogic, queryStepDetailLogic, refineRecipeLogic };

/**
 * procedural cooking state machine coordinating recipe discovery, paced ingredient prep,
 * and step-by-step cooking navigation.
 */
export const cookingMachine = setup({
  types: {
    context: {} as CookingContext,
    events: {} as CookingEvent,
  },
  actions: {
    ...speechActions,
    handleRecognised,
    speakLastUtterance: ({ context }: { context: CookingContext }) => {
      if (context.spstRef) {
        context.spstRef.send({
          type: 'SPEAK',
          value: {
            utterance: context.lastSpokenUtterance ?? '',
          },
        });
      }
    },
    setListening: assign({ speechStatus: 'listening' as const }),
    resetCookingSession: assign({
      recipe: null,
      recipeCandidates: null,
      currentStepIndex: 0,
      prepBatchIndex: 0,
      selectedCandidateId: null,
      knowledgeQuery: null,
      recipePrompt: null,
    }),
  },
  actors: {
    fetchRecipeActor: fetchRecipeLogic,
    queryKnowledgeActor: queryKnowledgeLogic,
    queryStepDetailActor: queryStepDetailLogic,
    refineRecipeActor: refineRecipeLogic,
    speechstateActor: speechstate,
    timerActor: timerActorLogic,
  },
  guards: cookingGuards,
}).createMachine({
  id: 'CookMate',
  initial: 'Idle',
  context: ({ spawn }) => ({
    recipe: null,
    prepBatchIndex: 0,
    currentStepIndex: 0,
    lastSpokenUtterance: null,
    lastResult: null,
    messages: [
      {
        role: ROLES.System,
        content: prompts.systemDefault,
      },
    ],
    noInputCount: 0,
    debugNoInput: 0,
    lastNoInputAt: null,
    errorMessage: null,
    recipePrompt: null,
    spstRef: spawn('speechstateActor', { input: settings }),
    timerRef: spawn('timerActor'),
    activeTimers: [],
    speechStatus: 'idle',
    pendingUtterance: null,
    lastResolvedAct: null,
    lastResolvedEntities: null,
    silentNoInput: false,
    selectedCandidateId: null,
    knowledgeQuery: null,
    knowledgeCategory: null,
    returnState: null,
  }),
  on: {
    RECOGNISED: {
      actions: [
        assign(({ context, event }) => {
          const userUtterance = event.value[0]?.utterance?.trim();
          const timestamp = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return {
            lastResult: event.value,
            noInputCount: 0,
            debugNoInput: 0,
            pendingUtterance: null,
            silentNoInput: false,
            speechStatus: 'processing',
            messages: userUtterance
              ? [
                  ...context.messages,
                  {
                    role: ROLES.User,
                    content: userUtterance,
                    timestamp,
                  },
                ]
              : context.messages,
          };
        }),
        'handleRecognised',
      ],
    },
    ACT_RESOLVED: {
      actions: assign(({ context, event }) => {
        const lastUserIndex = context.messages.map((m) => m.role).lastIndexOf(ROLES.User);
        const messages =
          lastUserIndex === -1
            ? context.messages
            : context.messages.map((m, idx) =>
                idx === lastUserIndex ? { ...m, act: event.act } : m,
              );
        return {
          lastResolvedAct: event.act,
          lastResolvedEntities: event.entities ?? null,
          messages,
        };
      }),
    },
    ASR_NOINPUT: [
      {
        guard: 'isUnderNoInputLimit',
        actions: assign(({ context }) => {
          const idx = Math.min(context.noInputCount, prompts.noInput.length - 1);
          const text = prompts.noInput[idx];
          const nextCount = context.noInputCount + 1;
          return {
            noInputCount: nextCount,
            debugNoInput: (context.debugNoInput ?? 0) + 1,
            pendingUtterance: text,
            lastNoInputAt: new Date().toISOString(),
          };
        }),
      },
      {
        actions: assign({
          debugNoInput: ({ context }) => (context.debugNoInput ?? 0) + 1,
          lastNoInputAt: () => new Date().toISOString(),
        }),
      },
    ],
    LISTEN_COMPLETE: [
      {
        guard: 'hasPendingUtterance',
        actions: [
          assign(({ context }) => {
            const text = context.pendingUtterance ?? '';
            const isPaused = context.noInputCount >= prompts.noInput.length;
            const asst = prepareAssistantSpeech(context, text);
            return {
              ...asst,
              pendingUtterance: null,
              speechStatus: isPaused ? ('paused' as const) : ('speaking' as const),
            };
          }),
          'speakLastUtterance',
        ],
      },
      {
        guard: ({ context }) =>
          context.speechStatus === 'listening' || Boolean(context.silentNoInput),
        actions: [
          assign({ silentNoInput: false, speechStatus: 'listening' }),
          { type: 'spst.listen' },
        ],
      },
    ],
    UNKNOWN: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.cannotHear)),
        'speakLastUtterance',
      ],
    },
    CLICK: [
      {
        guard: 'isNoInputLimitReached',
        actions: [
          assign({
            noInputCount: 0,
            debugNoInput: 0,
            pendingUtterance: null,
            speechStatus: 'listening',
          }),
          { type: 'spst.listen' },
        ],
      },
    ],
    WAKE_WORD: [
      {
        guard: 'isNoInputLimitReached',
        actions: [
          assign({
            noInputCount: 0,
            debugNoInput: 0,
            pendingUtterance: null,
            speechStatus: 'listening',
          }),
          { type: 'spst.listen' },
        ],
      },
      {
        actions: ['setListening', 'spst.listen'],
      },
    ],
    PTT_TRIGGER: [
      {
        guard: 'isNoInputLimitReached',
        actions: [
          assign({
            noInputCount: 0,
            debugNoInput: 0,
            pendingUtterance: null,
            speechStatus: 'listening',
          }),
          { type: 'spst.listen' },
        ],
      },
      {
        actions: ['setListening', 'spst.listen'],
      },
    ],
    TIMERS_UPDATED: {
      actions: assign({
        activeTimers: ({ event }) => event.timers,
      }),
    },
    TIMER_EXPIRED: {
      actions: [
        assign(({ context, event }) =>
          prepareAssistantSpeech(context, `Time's up! Your ${event.label} timer is done.`),
        ),
        'speakLastUtterance',
      ],
    },
    SET_TIMER: {
      actions: [
        ({ context, event }) => {
          if (context.timerRef && event.type === 'SET_TIMER') {
            const id = `timer-${Date.now()}`;
            const label = event.label?.trim() || 'cooking';
            context.timerRef.send({
              type: 'START_TIMER',
              id,
              label,
              durationSeconds: event.durationSeconds,
            });
          }
        },
        assign(({ context, event }) => {
          const label = event.label?.trim() || 'cooking';
          const duration = formatDurationForSpeech(event.durationSeconds);
          return prepareAssistantSpeech(context, `Started a ${duration} timer for ${label}.`);
        }),
        'speakLastUtterance',
      ],
    },
    CHECK_TIMER: {
      actions: [
        assign(({ context, event }) => {
          const matching = event.label
            ? context.activeTimers.filter((t) => t.label === event.label)
            : context.activeTimers;
          return prepareAssistantSpeech(context, formatCheckTimerUtterance(matching, event.label));
        }),
        'speakLastUtterance',
      ],
    },
    CANCEL_TIMER: {
      actions: [
        ({ context, event }) => {
          if (context.timerRef && event.type === 'CANCEL_TIMER') {
            if (event.label || event.id) {
              context.timerRef.send({
                type: 'CANCEL_TIMER',
                id: event.id,
                label: event.label,
              });
            } else {
              context.timerRef.send({ type: 'RESET_TIMERS' });
            }
          }
        },
        assign(({ context, event }) => {
          const text = event.label?.trim()
            ? `Cancelled the ${event.label.trim()} timer.`
            : 'Cancelled all timers.';
          return prepareAssistantSpeech(context, text);
        }),
        'speakLastUtterance',
      ],
    },
    QUERY_INGREDIENT: {
      actions: [
        assign(({ context, event }) =>
          prepareAssistantSpeech(
            context,
            lookupIngredient(context.recipe?.ingredients ?? [], event.ingredient),
          ),
        ),
        'speakLastUtterance',
      ],
    },
    QUERY_STEP_DETAIL: {
      target: '.QueryingStepDetail',
      actions: assign(({ context, event, self }) => ({
        knowledgeQuery: event.query,
        returnState: resolveReturnState(context, self),
      })),
    },
    INQUIRE_TECHNIQUE: {
      target: '.QueryingKnowledge',
      actions: assign(({ context, event, self }) => ({
        knowledgeQuery: event.query,
        knowledgeCategory: 'techniques',
        returnState: resolveReturnState(context, self),
      })),
    },
    INQUIRE_SUBSTITUTION: {
      target: '.QueryingKnowledge',
      actions: assign(({ context, event, self }) => ({
        knowledgeQuery: event.query,
        knowledgeCategory: 'substitutions',
        returnState: resolveReturnState(context, self),
      })),
    },
    SEARCH_RECIPE: {
      target: '.FetchingRecipe',
    },
    HELP: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.help)),
        'speakLastUtterance',
      ],
    },
    GREETING: {
      actions: [
        assign(({ context }) => prepareAssistantSpeech(context, prompts.greeting)),
        'speakLastUtterance',
      ],
    },
  },
  states: {
    Idle: {
      on: {
        START: 'Prepare',
        CLICK: 'Prepare',
        WAKE_WORD: 'Prepare',
        PTT_TRIGGER: 'Prepare',
        ASR_NOINPUT: {},
        LISTEN_COMPLETE: {},
      },
    },

    Prepare: {
      entry: [assign({ speechStatus: 'processing' }), { type: 'spst.prepare' }],
      on: {
        ASRTTS_READY: 'PromptRecipe',
      },
    },

    PromptRecipe: {
      entry: [
        assign(({ context }) => ({
          ...prepareAssistantSpeech(context, context.recipePrompt ?? prompts.promptRecipe),
          recipePrompt: null,
          errorMessage: null,
        })),
        'speakLastUtterance',
      ],
      on: {
        SPEAK_COMPLETE: {
          guard: 'isUnderNoInputLimit',
          actions: ['setListening', 'spst.listen'],
        },
        SEARCH_RECIPE: 'FetchingRecipe',
        SELECT_RECIPE: 'FetchingRecipe',
      },
    },

    FetchingRecipe: {
      entry: assign({ speechStatus: 'processing' }),
      invoke: {
        id: 'fetchRecipeActor',
        src: 'fetchRecipeActor',
        input: ({ event }) => ({
          query:
            event.type === 'SEARCH_RECIPE'
              ? event.query
              : event.type === 'SELECT_RECIPE'
                ? (event.query ?? '')
                : '',
        }),
        onDone: [
          {
            guard: ({ event }) =>
              event.output != null && typeof event.output === 'object' && 'steps' in event.output,
            target: 'ConfirmRecipe',
            actions: assign({
              recipe: ({ event }) => event.output as unknown as NormalizedRecipe,
              recipeCandidates: null,
              prepBatchIndex: 0,
              currentStepIndex: 0,
              errorMessage: null,
            }),
          },
          {
            guard: ({ event }) =>
              event.output != null &&
              typeof event.output === 'object' &&
              'kind' in event.output &&
              event.output.kind === 'single',
            target: 'ConfirmRecipe',
            actions: assign({
              recipe: ({ event }) =>
                (event.output as { kind: 'single'; recipe: NormalizedRecipe }).recipe,
              recipeCandidates: null,
              prepBatchIndex: 0,
              currentStepIndex: 0,
              errorMessage: null,
            }),
          },
          {
            target: 'SelectingRecipe',
            actions: assign({
              recipeCandidates: ({ event }) =>
                (
                  event.output as {
                    kind: 'multiple';
                    candidates: readonly RecipeCandidate[];
                  }
                ).candidates,
            }),
          },
        ],
        onError: {
          target: 'PromptRecipe',
          actions: assign(({ event }) => ({
            recipePrompt:
              'Sorry, I could not find a recipe for that. What else would you like to cook?',
            errorMessage: event.error instanceof Error ? event.error.message : String(event.error),
          })),
        },
      },
    },

    SelectingRecipe: {
      entry: [
        assign(({ context }) =>
          prepareAssistantSpeech(context, formatCandidateUtterance(context.recipeCandidates ?? [])),
        ),
        'speakLastUtterance',
      ],
      on: {
        SPEAK_COMPLETE: {
          guard: 'isUnderNoInputLimit',
          actions: ['setListening', 'spst.listen'],
        },
        SELECT_RECIPE: [
          {
            guard: ({ context, event }) =>
              matchCandidate(context.recipeCandidates ?? [], event.index, event.query) !== null,
            target: 'RefiningSelectedRecipe',
            actions: assign(({ context, event }) => {
              const matched = matchCandidate(
                context.recipeCandidates ?? [],
                event.index,
                event.query,
              );
              return {
                selectedCandidateId: matched?.id ?? null,
              };
            }),
          },
          {
            actions: [
              assign(({ context }) =>
                prepareAssistantSpeech(context, prompts.selectRecipeReprompt),
              ),
              'speakLastUtterance',
            ],
          },
        ],
        GOTO_STEP: [
          {
            guard: ({ context, event }) =>
              matchCandidate(context.recipeCandidates ?? [], event.stepNumber) !== null,
            target: 'RefiningSelectedRecipe',
            actions: assign(({ context, event }) => {
              const matched = matchCandidate(context.recipeCandidates ?? [], event.stepNumber);
              return {
                selectedCandidateId: matched?.id ?? null,
              };
            }),
          },
          {
            actions: [
              assign(({ context }) =>
                prepareAssistantSpeech(context, prompts.selectRecipeReprompt),
              ),
              'speakLastUtterance',
            ],
          },
        ],
        SEARCH_RECIPE: 'FetchingRecipe',
        DENY: 'PromptRecipe',
        HELP: {
          actions: [
            assign(({ context }) => prepareAssistantSpeech(context, prompts.selectRecipeHelp)),
            'speakLastUtterance',
          ],
        },
      },
    },

    RefiningSelectedRecipe: {
      entry: assign({ speechStatus: 'processing' }),
      invoke: {
        id: 'refineRecipeActor',
        src: 'refineRecipeActor',
        input: ({ context }) => ({
          candidateId: context.selectedCandidateId ?? '',
        }),
        onDone: {
          target: 'ConfirmRecipe',
          actions: assign({
            recipe: ({ event }) => event.output,
            recipeCandidates: null,
            selectedCandidateId: null,
            prepBatchIndex: 0,
            currentStepIndex: 0,
            errorMessage: null,
          }),
        },
        onError: {
          target: 'PromptRecipe',
          actions: assign(({ event }) => ({
            recipePrompt: 'Sorry, I could not load that recipe. What else would you like to cook?',
            selectedCandidateId: null,
            errorMessage: event.error instanceof Error ? event.error.message : String(event.error),
          })),
        },
      },
    },

    ConfirmRecipe: {
      entry: [
        assign(({ context }) => {
          const recipe = context.recipe;
          const time = recipe?.totalEstimatedMinutes ?? 20;
          return prepareAssistantSpeech(
            context,
            `Found ${recipe?.title}. It takes about ${time} minutes. Ready to gather ingredients?`,
          );
        }),
        'speakLastUtterance',
      ],
      on: {
        SPEAK_COMPLETE: {
          guard: 'isUnderNoInputLimit',
          actions: ['setListening', 'spst.listen'],
        },
        AFFIRM: 'AnnouncePrepBatch',
        SKIP_PREP: 'AnnounceStep',
        NEXT_STEP: 'AnnounceStep',
        GOTO_STEP: [
          {
            guard: 'isValidStepNumber',
            actions: assign({
              currentStepIndex: ({ event }) =>
                event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
            }),
            target: 'AnnounceStep',
          },
          {
            actions: [
              assign(({ context }) => {
                const total = context.recipe?.steps.length ?? 0;
                return prepareAssistantSpeech(
                  context,
                  `This recipe has ${total} steps. Which step would you like?`,
                );
              }),
              'speakLastUtterance',
            ],
          },
        ],
        DENY: 'PromptRecipe',
      },
    },

    AnnouncePrepBatch: {
      entry: [
        assign(({ context }) =>
          prepareAssistantSpeech(
            context,
            formatPrepBatchUtterance(context.recipe?.ingredients ?? [], context.prepBatchIndex),
          ),
        ),
        'speakLastUtterance',
      ],
      always: 'WaitingForPrepConfirmation',
    },

    WaitingForPrepConfirmation: {
      on: {
        ASR_NOINPUT: {
          actions: assign({
            silentNoInput: true,
            debugNoInput: ({ context }) => (context.debugNoInput ?? 0) + 1,
            lastNoInputAt: () => new Date().toISOString(),
          }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) =>
              context.speechStatus === 'listening' || Boolean(context.silentNoInput),
            actions: [
              assign({ silentNoInput: false, speechStatus: 'listening' }),
              { type: 'spst.listen' },
            ],
          },
        ],
        SPEAK_COMPLETE: {
          guard: 'isUnderNoInputLimit',
          actions: ['setListening', 'spst.listen'],
        },
        AFFIRM: [
          {
            guard: 'hasMorePrepBatches',
            actions: assign({
              prepBatchIndex: ({ context }) => context.prepBatchIndex + 1,
            }),
            target: 'AnnouncePrepBatch',
          },
          {
            target: 'AnnounceStep',
          },
        ],
        NEXT_STEP: [
          {
            guard: 'hasMorePrepBatches',
            actions: assign({
              prepBatchIndex: ({ context }) => context.prepBatchIndex + 1,
            }),
            target: 'AnnouncePrepBatch',
          },
          {
            target: 'AnnounceStep',
          },
        ],
        DENY: {
          actions: [
            assign(({ context }) =>
              prepareAssistantSpeech(
                context,
                "Take your time. Say 'ready' or 'yes' when you have them.",
              ),
            ),
            'speakLastUtterance',
          ],
        },
        REPEAT_STEP: 'AnnouncePrepBatch',
        SKIP_PREP: 'AnnounceStep',
        GOTO_STEP: [
          {
            guard: 'isValidStepNumber',
            actions: assign({
              currentStepIndex: ({ event }) =>
                event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
            }),
            target: 'AnnounceStep',
          },
          {
            actions: [
              assign(({ context }) => {
                const total = context.recipe?.steps.length ?? 0;
                return prepareAssistantSpeech(
                  context,
                  `This recipe has ${total} steps. Which step would you like?`,
                );
              }),
              'speakLastUtterance',
            ],
          },
        ],
      },
    },

    AnnounceStep: {
      entry: [
        assign(({ context }) => {
          const steps = context.recipe?.steps ?? [];
          const step = steps[context.currentStepIndex];
          const text = step ? formatStepUtterance(step, steps.length) : 'All steps completed.';
          return prepareAssistantSpeech(context, text);
        }),
        'speakLastUtterance',
      ],
      always: 'WaitingForStepCommand',
    },

    WaitingForStepCommand: {
      on: {
        ASR_NOINPUT: {
          actions: assign({
            silentNoInput: true,
            debugNoInput: ({ context }) => (context.debugNoInput ?? 0) + 1,
            lastNoInputAt: () => new Date().toISOString(),
          }),
        },
        LISTEN_COMPLETE: [
          {
            guard: ({ context }) =>
              context.speechStatus === 'listening' || Boolean(context.silentNoInput),
            actions: [
              assign({ silentNoInput: false, speechStatus: 'listening' }),
              { type: 'spst.listen' },
            ],
          },
        ],
        SPEAK_COMPLETE: {
          guard: 'isUnderNoInputLimit',
          actions: ['setListening', 'spst.listen'],
        },
        AFFIRM: [
          {
            guard: 'isLastStep',
            target: 'Completed',
          },
          {
            actions: assign({
              currentStepIndex: ({ context }) => context.currentStepIndex + 1,
            }),
            target: 'AnnounceStep',
          },
        ],
        DENY: {
          actions: [
            assign(({ context }) =>
              prepareAssistantSpeech(context, "No rush. Say 'next step' whenever you're ready."),
            ),
            'speakLastUtterance',
          ],
        },
        NEXT_STEP: [
          {
            guard: 'isLastStep',
            target: 'Completed',
          },
          {
            actions: assign({
              currentStepIndex: ({ context }) => context.currentStepIndex + 1,
            }),
            target: 'AnnounceStep',
          },
        ],
        PREVIOUS_STEP: [
          {
            guard: 'canGoBackStep',
            actions: assign({
              currentStepIndex: ({ context }) => context.currentStepIndex - 1,
            }),
            target: 'AnnounceStep',
          },
          {
            target: 'AnnounceStep',
          },
        ],
        REPEAT_STEP: 'AnnounceStep',
        GOTO_STEP: [
          {
            guard: 'isValidStepNumber',
            actions: assign({
              currentStepIndex: ({ event }) =>
                event.type === 'GOTO_STEP' ? event.stepNumber - 1 : 0,
            }),
            target: 'AnnounceStep',
          },
          {
            actions: [
              assign(({ context }) => {
                const total = context.recipe?.steps.length ?? 0;
                return prepareAssistantSpeech(
                  context,
                  `This recipe has ${total} steps. Which step would you like?`,
                );
              }),
              'speakLastUtterance',
            ],
          },
        ],
      },
    },

    QueryingStepDetail: {
      entry: assign({ speechStatus: 'processing' }),
      invoke: {
        id: 'queryStepDetailActor',
        src: 'queryStepDetailActor',
        input: ({ context }) => {
          const activeStep = context.recipe?.steps[context.currentStepIndex];
          return {
            query: context.knowledgeQuery ?? '',
            instruction: activeStep?.instruction,
            stepNumber: activeStep?.stepNumber,
            recipeTitle: context.recipe?.title,
          };
        },
        onDone: {
          target: 'SpeakingKnowledge',
          actions: assign(({ context, event }) => prepareAssistantSpeech(context, event.output)),
        },
        onError: {
          target: 'SpeakingKnowledge',
          actions: assign(({ context }) =>
            prepareAssistantSpeech(context, "Sorry, I couldn't find details on that step."),
          ),
        },
      },
    },

    QueryingKnowledge: {
      entry: assign({ speechStatus: 'processing' }),
      invoke: {
        id: 'queryKnowledgeActor',
        src: 'queryKnowledgeActor',
        input: ({ context }) => {
          const msgs = context.messages ?? [];
          const lastMsg = msgs[msgs.length - 1];
          // strip current user query from history if already recorded by speech recognition
          const priorMessages = (lastMsg?.role === ROLES.User ? msgs.slice(0, -1) : msgs)
            .filter((m) => m.role === ROLES.Assistant || m.role === ROLES.User)
            .slice(-DEFAULT_CONVERSATION_WINDOW)
            .map((m) => ({
              role: m.role as 'assistant' | 'user',
              content: m.content,
            }));

          const activeStep = context.recipe?.steps[context.currentStepIndex];
          const stepContext = activeStep
            ? `Recipe: ${context.recipe?.title}, Step ${activeStep.stepNumber}: ${activeStep.instruction}`
            : context.recipe?.title
              ? `Recipe: ${context.recipe.title}`
              : undefined;

          return {
            query: context.knowledgeQuery ?? '',
            category: context.knowledgeCategory ?? undefined,
            recentMessages: priorMessages,
            stepContext,
          };
        },
        onDone: {
          target: 'SpeakingKnowledge',
          actions: assign(({ context, event }) => prepareAssistantSpeech(context, event.output)),
        },
        onError: {
          target: 'SpeakingKnowledge',
          actions: assign(({ context }) =>
            prepareAssistantSpeech(
              context,
              "Sorry, I couldn't find advice on that in my culinary guides.",
            ),
          ),
        },
      },
    },

    SpeakingKnowledge: {
      entry: 'speakLastUtterance',
      exit: assign({ returnState: null }),
      on: {
        SPEAK_COMPLETE: [
          {
            guard: ({ context }) => context.returnState === 'WaitingForPrepConfirmation',
            actions: ['setListening', 'spst.listen'],
            target: 'WaitingForPrepConfirmation',
          },
          {
            guard: ({ context }) => context.returnState === 'ConfirmRecipe',
            target: 'ConfirmRecipe',
          },
          {
            guard: ({ context }) => context.returnState === 'SelectingRecipe',
            target: 'SelectingRecipe',
          },
          {
            guard: ({ context }) => context.returnState === 'PromptRecipe',
            target: 'PromptRecipe',
          },
          {
            guard: ({ context }) => context.returnState === 'Idle',
            target: 'Idle',
          },
          {
            guard: ({ context }) => context.returnState === 'Completed',
            target: 'Completed',
          },
          {
            actions: ['setListening', 'spst.listen'],
            target: 'WaitingForStepCommand',
          },
        ],
      },
    },

    Completed: {
      entry: [
        assign(({ context }) => ({
          ...prepareAssistantSpeech(context, 'All steps completed. Enjoy your meal!'),
          speechStatus: 'idle',
        })),
        'speakLastUtterance',
      ],
      on: {
        START: {
          target: 'PromptRecipe',
          actions: 'resetCookingSession',
        },
        CLICK: {
          target: 'PromptRecipe',
          actions: 'resetCookingSession',
        },
        ASR_NOINPUT: {},
        LISTEN_COMPLETE: {},
      },
    },
  },
});
