/// <reference path="./better-sqlite3.d.ts" />
import Database from 'better-sqlite3';
import { A9PersistenceManager } from '../src/a9-persistence';

function open() {
  const result = A9PersistenceManager.open({
    databasePath: ':memory:',
    dataRoot: '/memory',
    openDatabase: (databasePath, options) => new Database(databasePath, options) as any,
  });
  if (result.status !== 'ready') throw new Error(result.status);
  return result.manager;
}

function seed(manager: A9PersistenceManager, questionId = 'q-fixed') {
  manager.createConversation('conversation-1', '/workspace');
  manager.upsertTask('task-1', 'conversation-1', 'active');
  manager.upsertTurn('turn-1', 'task-1', 'conversation-1', 'active');
  manager.recordQuestionPending('/workspace', {
    schemaVersion: 1,
    questionId,
    revision: 1,
    workspace: '/workspace',
    conversationId: 'conversation-1',
    taskId: 'task-1',
    turnId: 'turn-1',
    callId: 'call-1',
    prompt: 'Which target?',
    options: ['staging', 'production'],
    recovered: false,
  });
}

describe('A9-42 question persistence', () => {
  it('writes a versioned question and returns it after reopening without new table structure', () => {
    const manager = open();
    try {
      seed(manager);
      expect(manager.getPendingQuestion('/workspace', 'conversation-1')).toMatchObject({
        schemaVersion: 1, questionId: 'q-fixed', revision: 1,
        prompt: 'Which target?', options: ['staging', 'production'],
      });
      expect(manager.listConversations('/workspace')[0].activity).toBe('waiting_input');
      expect(manager.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'a9_question%'").all()).toEqual([]);
    } finally { manager.db.close(); }
  });

  it('commits answer/cancel once and treats an exact repeat as no side effect', () => {
    const manager = open();
    try {
      seed(manager);
      const answer = manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: 'staging',
      });
      expect(answer).toMatchObject({ decision: 'answered', answer: 'staging', duplicate: false });
      expect(manager.getPendingQuestion('/workspace', 'conversation-1')).toBeNull();
      expect(manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: 'staging',
      })).toMatchObject({ duplicate: true });
      expect(manager.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 1 });
      expect(manager.listConversations('/workspace')[0].activity).not.toBe('waiting_input');
    } finally { manager.db.close(); }
  });

  it('rejects empty answers, cross-conversation identity, stale revisions, extra decisions and conflicting repeats', () => {
    const manager = open();
    try {
      seed(manager);
      manager.createConversation('conversation-2', '/workspace');
      expect(() => manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: '   ',
      })).toThrow('A9_QUESTION_REPLY_INVALID');
      expect(() => manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-2', questionId: 'q-fixed', revision: 1,
        decision: 'cancelled',
      })).toThrow('A9_QUESTION_STALE');
      expect(() => manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 2,
        decision: 'cancelled',
      })).toThrow('A9_QUESTION_STALE');
      expect(() => manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'cancelled', answer: 'not allowed',
      } as any)).toThrow('A9_QUESTION_REPLY_INVALID');
      manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: 'staging',
      });
      expect(() => manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: 'production',
      })).toThrow('A9_QUESTION_REPLY_CONFLICT');
    } finally { manager.db.close(); }
  });

  it('audit failure rolls back the pending fact and keeps the conversation usable', () => {
    const manager = open();
    try {
      manager.createConversation('conversation-1', '/workspace');
      manager.db.exec("CREATE TRIGGER fail_question BEFORE INSERT ON a9_events WHEN NEW.event_type='question_pending' BEGIN SELECT RAISE(ABORT, 'question audit failed'); END;");
      expect(() => manager.recordQuestionPending('/workspace', {
        schemaVersion: 1, questionId: 'q-fixed', revision: 1,
        workspace: '/workspace', conversationId: 'conversation-1',
        taskId: 'task-1', turnId: 'turn-1', callId: 'call-1',
        prompt: 'Which target?', options: [], recovered: false,
      })).toThrow('question audit failed');
      expect(manager.getPendingQuestion('/workspace', 'conversation-1')).toBeNull();
      expect(manager.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_pending'").get()).toEqual({ n: 0 });
    } finally { manager.db.close(); }
  });

  it('restart keeps the unanswered question visible and does not auto-answer or replay old queue', () => {
    const manager = open();
    try {
      seed(manager);
      manager.markInterruptionsOnRestart();
      expect(manager.getPendingQuestion('/workspace', 'conversation-1')).toMatchObject({ questionId: 'q-fixed', revision: 1 });
      expect(manager.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 0 });
      expect(manager.db.prepare("SELECT count(*) n FROM a9_turns WHERE status='interrupted'").get()).toEqual({ n: 1 });
    } finally { manager.db.close(); }
  });

  it('passed answer survives restart for controlled continuation summary', () => {
    const manager = open();
    try {
      seed(manager);
      manager.recordModelEvent('conversation-1', null, 'conversation.request', {
        taskId: 'task-1', requestPrompt: 'Deploy it',
      });
      manager.resolveQuestion('/workspace', {
        conversationId: 'conversation-1', questionId: 'q-fixed', revision: 1,
        decision: 'answered', answer: 'staging',
      });
      manager.markInterruptionsOnRestart();
      expect(manager.getTaskRecovery('/workspace', 'conversation-1', 'task-1')?.answeredQuestion).toEqual({
        questionId: 'q-fixed', revision: 1, prompt: 'Which target?', answer: 'staging',
      });
    } finally { manager.db.close(); }
  });
});
