'use strict';

(function exposeEventQueue(root) {
  function create(maxPending) {
    const limit = Number.isInteger(maxPending) && maxPending > 0 ? maxPending : 120;
    const seen = new Set();
    const pending = [];
    let lastSequence = 0;
    let overflowed = false;

    return Object.freeze({
      push(event) {
        if (!event || typeof event.eventId !== 'string' || !Number.isInteger(event.sequence)) {
          return { accepted: false, reason: 'invalid' };
        }
        if (seen.has(event.eventId)) return { accepted: false, reason: 'duplicate' };
        if (event.sequence <= lastSequence) return { accepted: false, reason: 'out_of_order' };
        const gap = lastSequence > 0 && event.sequence > lastSequence + 1;
        seen.add(event.eventId);
        lastSequence = event.sequence;
        pending.push(event);
        if (pending.length > limit) {
          pending.shift();
          overflowed = true;
        }
        return { accepted: true, gap, overflowed };
      },
      drain(maxItems) {
        const count = Number.isInteger(maxItems) && maxItems > 0 ? maxItems : pending.length;
        return pending.splice(0, count);
      },
      get size() { return pending.length; },
      get overflowed() { return overflowed; },
    });
  }

  root.win7AgentEventQueue = Object.freeze({ create });
}(window));
