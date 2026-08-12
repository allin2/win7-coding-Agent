/** Event-backed implementation of Core's structural RuntimeMessageProjector port. */
import { EventLedger, JsonValue, projectThread } from './event-protocol';

export interface RuntimeProjectionRequest {
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly upToSequence?: number;
}

export class RuntimeMessageProjection {
  constructor(private readonly ledger: EventLedger) {}

  projectMessages(input: RuntimeProjectionRequest): readonly JsonValue[] {
    const events = this.ledger.queryThread(input.threadId)
      .filter((event) => input.upToSequence === undefined || event.seq <= input.upToSequence);
    return projectThread(events).messages;
  }
}
