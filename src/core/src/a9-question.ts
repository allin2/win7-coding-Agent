/**
 * A9-42 ask_user contract (ADR-0300).
 *
 * A question is a read-only request for information. It never grants approval
 * for a file, process, Git or network operation.
 */

import * as crypto from 'crypto';

export const A9_QUESTION_SCHEMA_VERSION = 1 as const;
export const A9_QUESTION_PROMPT_MAX_CHARS = 2000;
export const A9_QUESTION_OPTION_MAX_CHARS = 200;
export const A9_QUESTION_OPTIONS_MAX = 6;
export const A9_QUESTION_ANSWER_MAX_CHARS = 2048;

export interface A9QuestionIdentity {
  workspace: string;
  conversationId: string;
  taskId: string;
}

export interface A9PendingQuestion {
  schemaVersion: typeof A9_QUESTION_SCHEMA_VERSION;
  questionId: string;
  revision: number;
  workspace: string;
  conversationId: string;
  taskId: string;
  turnId: string;
  callId: string;
  prompt: string;
  options: string[];
  recovered: boolean;
}

export interface A9QuestionReplyInput {
  conversationId: string;
  questionId: string;
  revision: number;
  decision: 'answered' | 'cancelled';
  answer?: string;
}

export interface A9ValidatedQuestionInput {
  prompt: string;
  options: string[];
}

function questionError(code: string, message: string): Error & { code: string } {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  return error;
}

function nonEmptyBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxChars;
}

/**
 * Validate model-facing ask_user arguments. ToolRegistry enforces the same
 * JSON Schema bounds; this second check protects direct Core consumers and
 * rejects blank options that JSON Schema cannot express.
 */
export function validateA9QuestionInput(args: Record<string, unknown>): A9ValidatedQuestionInput {
  if (!nonEmptyBoundedString(args.prompt, A9_QUESTION_PROMPT_MAX_CHARS)) {
    throw questionError('A9_QUESTION_INPUT_INVALID', `prompt must be a non-empty string of at most ${A9_QUESTION_PROMPT_MAX_CHARS} characters`);
  }
  if (args.options !== undefined) {
    if (!Array.isArray(args.options) || args.options.length > A9_QUESTION_OPTIONS_MAX) {
      throw questionError('A9_QUESTION_INPUT_INVALID', `options must contain at most ${A9_QUESTION_OPTIONS_MAX} strings`);
    }
    for (const option of args.options) {
      if (!nonEmptyBoundedString(option, A9_QUESTION_OPTION_MAX_CHARS)) {
        throw questionError('A9_QUESTION_INPUT_INVALID', `each option must be a non-empty string of at most ${A9_QUESTION_OPTION_MAX_CHARS} characters`);
      }
    }
  }
  return {
    prompt: args.prompt,
    options: args.options === undefined ? [] : [...args.options] as string[],
  };
}

/** Validate a reply from the host before it can reach a suspended Turn. */
export function validateA9QuestionReply(input: A9QuestionReplyInput): A9QuestionReplyInput {
  if (!input || typeof input !== 'object'
    || !nonEmptyBoundedString(input.conversationId, 256)
    || !nonEmptyBoundedString(input.questionId, 256)
    || !Number.isSafeInteger(input.revision) || input.revision < 1
    || (input.decision !== 'answered' && input.decision !== 'cancelled')) {
    throw questionError('A9_QUESTION_REPLY_INVALID', 'invalid question identity or decision');
  }
  if (input.decision === 'answered') {
    if (!nonEmptyBoundedString(input.answer, A9_QUESTION_ANSWER_MAX_CHARS)) {
      throw questionError('A9_QUESTION_REPLY_INVALID', `answer must be a non-empty string of at most ${A9_QUESTION_ANSWER_MAX_CHARS} characters`);
    }
  } else if (input.answer !== undefined) {
    throw questionError('A9_QUESTION_REPLY_INVALID', 'cancelled replies must not contain an answer');
  }
  return {
    conversationId: input.conversationId,
    questionId: input.questionId,
    revision: input.revision,
    decision: input.decision,
    ...(input.decision === 'answered' ? { answer: input.answer } : {}),
  };
}

/** Build the versioned, fully bound pending question. */
export function buildA9PendingQuestion(input: {
  identity: A9QuestionIdentity;
  turnId: string;
  callId: string;
  prompt: string;
  options: string[];
  recovered?: boolean;
}): A9PendingQuestion {
  const identity = input.identity;
  for (const [field, value] of Object.entries(identity)) {
    if (!nonEmptyBoundedString(value, 1024)) {
      throw questionError('A9_QUESTION_IDENTITY_INVALID', `${field} must be a non-empty bounded string`);
    }
  }
  if (!nonEmptyBoundedString(input.turnId, 256) || !nonEmptyBoundedString(input.callId, 256)) {
    throw questionError('A9_QUESTION_IDENTITY_INVALID', 'turnId and callId are required');
  }
  return {
    schemaVersion: A9_QUESTION_SCHEMA_VERSION,
    questionId: `q-${crypto.randomBytes(16).toString('hex')}`,
    revision: 1,
    workspace: identity.workspace,
    conversationId: identity.conversationId,
    taskId: identity.taskId,
    turnId: input.turnId,
    callId: input.callId,
    prompt: input.prompt,
    options: [...input.options],
    recovered: input.recovered === true,
  };
}
