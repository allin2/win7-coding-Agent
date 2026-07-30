/**
 * replay.ts — Replay engine for session event sequences.
 *
 * Replays events in chronological order for a given session and verifies
 * that the resulting state matches expectations. Aligns with Phase 2
 * Replay semantics (ADR-0026/ADR-0029).
 */

import { Event, EventType, StateError, StateErrorCode } from './types';
import { IEventStore } from './store';

/** Result of a replay operation. */
export interface ReplayResult {
  /** Session ID that was replayed. */
  sessionId: string;
  /** All events in the session, in chronological order. */
  events: Event[];
  /** Derived state after replay. */
  finalState: SessionState;
  /** Whether the replay is complete (no broken chains). */
  traceComplete: boolean;
}

/** Result of a replay verification. */
export interface VerificationResult {
  /** Whether the replay matches the expected state. */
  matches: boolean;
  /** Discrepancies found, if any. */
  discrepancies: string[];
  /** The replay result that was verified. */
  replay: ReplayResult;
}

/** Derived session state after replaying events. */
export interface SessionState {
  /** Whether the session has started. */
  started: boolean;
  /** Whether the session has ended. */
  ended: boolean;
  /** Last known run status. */
  lastRunStatus: string | null;
  /** Number of model requests. */
  modelRequestCount: number;
  /** Number of model responses. */
  modelResponseCount: number;
  /** Number of tool requests. */
  toolRequestCount: number;
  /** Number of tool results. */
  toolResultCount: number;
  /** Number of policy decisions. */
  policyDecisionCount: number;
  /** Policy decisions log. */
  policyDecisions: Array<{ ruleId: string; decision: string }>;
  /** Last event timestamp. */
  lastEventTimestamp: string | null;
}

/** Create an empty session state. */
function createEmptyState(): SessionState {
  return {
    started: false,
    ended: false,
    lastRunStatus: null,
    modelRequestCount: 0,
    modelResponseCount: 0,
    toolRequestCount: 0,
    toolResultCount: 0,
    policyDecisionCount: 0,
    policyDecisions: [],
    lastEventTimestamp: null,
  };
}

/** Apply a single event to a session state, returning the updated state. */
function applyEvent(state: SessionState, event: Event): SessionState {
  const next = { ...state };
  next.lastEventTimestamp = event.timestamp;

  switch (event.type) {
    case EventType.SESSION_START:
      next.started = true;
      break;

    case EventType.SESSION_END:
      next.ended = true;
      break;

    case EventType.MODEL_REQUEST:
      next.modelRequestCount++;
      break;

    case EventType.MODEL_RESPONSE:
      next.modelResponseCount++;
      break;

    case EventType.TOOL_REQUEST:
      next.toolRequestCount++;
      break;

    case EventType.TOOL_RESULT:
      next.toolResultCount++;
      break;

    case EventType.RUN_STATUS: {
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload && typeof payload.status === 'string') {
        next.lastRunStatus = payload.status;
      }
      break;
    }

    case EventType.POLICY_DECISION: {
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload) {
        next.policyDecisionCount++;
        if (typeof payload.ruleId === 'string' && typeof payload.decision === 'string') {
          next.policyDecisions = [
            ...state.policyDecisions,
            { ruleId: payload.ruleId, decision: payload.decision },
          ];
        }
      }
      break;
    }
  }

  return next;
}

/** Replay engine for session event sequences. */
export class ReplayEngine {
  private store: IEventStore;

  constructor(store: IEventStore) {
    this.store = store;
  }

  /**
   * Replay all events for a session in chronological order.
   * Derives the final state by applying each event sequentially.
   */
  replay(sessionId: string): ReplayResult {
    const events = this.store.query({ sessionId });

    if (events.length === 0) {
      return {
        sessionId,
        events: [],
        finalState: createEmptyState(),
        traceComplete: false,
      };
    }

    let state = createEmptyState();
    for (const event of events) {
      state = applyEvent(state, event);
    }

    // trace_complete: session must have both started and ended.
    const traceComplete = state.started && state.ended;

    return {
      sessionId,
      events,
      finalState: state,
      traceComplete,
    };
  }

  /**
   * Verify that replaying a session produces the expected state.
   * Returns a VerificationResult with discrepancies listed.
   */
  verifyReplay(sessionId: string, expectedState: Partial<SessionState>): VerificationResult {
    const replayResult = this.replay(sessionId);
    const discrepancies: string[] = [];
    const actual = replayResult.finalState;

    if (expectedState.started !== undefined && actual.started !== expectedState.started) {
      discrepancies.push(
        `started: expected ${expectedState.started}, got ${actual.started}`,
      );
    }
    if (expectedState.ended !== undefined && actual.ended !== expectedState.ended) {
      discrepancies.push(
        `ended: expected ${expectedState.ended}, got ${actual.ended}`,
      );
    }
    if (expectedState.lastRunStatus !== undefined && actual.lastRunStatus !== expectedState.lastRunStatus) {
      discrepancies.push(
        `lastRunStatus: expected ${expectedState.lastRunStatus}, got ${actual.lastRunStatus}`,
      );
    }
    if (expectedState.modelRequestCount !== undefined && actual.modelRequestCount !== expectedState.modelRequestCount) {
      discrepancies.push(
        `modelRequestCount: expected ${expectedState.modelRequestCount}, got ${actual.modelRequestCount}`,
      );
    }
    if (expectedState.modelResponseCount !== undefined && actual.modelResponseCount !== expectedState.modelResponseCount) {
      discrepancies.push(
        `modelResponseCount: expected ${expectedState.modelResponseCount}, got ${actual.modelResponseCount}`,
      );
    }
    if (expectedState.toolRequestCount !== undefined && actual.toolRequestCount !== expectedState.toolRequestCount) {
      discrepancies.push(
        `toolRequestCount: expected ${expectedState.toolRequestCount}, got ${actual.toolRequestCount}`,
      );
    }
    if (expectedState.toolResultCount !== undefined && actual.toolResultCount !== expectedState.toolResultCount) {
      discrepancies.push(
        `toolResultCount: expected ${expectedState.toolResultCount}, got ${actual.toolResultCount}`,
      );
    }
    if (expectedState.policyDecisionCount !== undefined && actual.policyDecisionCount !== expectedState.policyDecisionCount) {
      discrepancies.push(
        `policyDecisionCount: expected ${expectedState.policyDecisionCount}, got ${actual.policyDecisionCount}`,
      );
    }

    return {
      matches: discrepancies.length === 0,
      discrepancies,
      replay: replayResult,
    };
  }
}
