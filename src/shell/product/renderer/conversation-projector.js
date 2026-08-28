'use strict';

(function exposeConversationProjector(root) {
  const DEFAULT_SEGMENT_LIMIT = 256 * 1024;
  const DEFAULT_MESSAGE_LIMIT = 1024 * 1024;
  const TERMINAL_EVENTS = new Set(['task.completed', 'task.cancelled', 'task.failed']);

  function create(options) {
    const config = options || {};
    const segmentLimitBytes = positiveInteger(config.segmentLimitBytes, DEFAULT_SEGMENT_LIMIT);
    const messageLimitBytes = positiveInteger(config.messageLimitBytes, DEFAULT_MESSAGE_LIMIT);
    const seen = new Map();
    const terminalTasks = new Set();
    const messageBytesByTask = new Map();
    const blocks = [];
    const warnings = [];
    let active = null;
    let lastSequence = 0;
    let blockCounter = 0;

    function push(event) {
      const emittedWarnings = [];
      if (!validEvent(event)) return { accepted: false, reason: 'invalid', warnings: emittedWarnings };
      const signature = fingerprint(event);
      if (seen.has(event.eventId)) {
        if (seen.get(event.eventId) !== signature) warn('EVENT_ID_CONFLICT', event, emittedWarnings);
        return { accepted: false, reason: seen.get(event.eventId) === signature ? 'duplicate' : 'conflict', warnings: emittedWarnings };
      }
      seen.set(event.eventId, signature);

      if (lastSequence > 0 && event.sequence <= lastSequence) {
        close('OUT_OF_ORDER');
        warn('SOURCE_OUT_OF_ORDER', event, emittedWarnings);
        return { accepted: false, reason: 'out_of_order', warnings: emittedWarnings };
      }
      if (lastSequence > 0 && event.sequence !== lastSequence + 1) {
        close('SOURCE_SEQUENCE_GAP');
        warn('SOURCE_SEQUENCE_GAP', event, emittedWarnings);
      }
      lastSequence = event.sequence;

      if (event.eventKind !== 'gateway.delta') {
        const closed = close(TERMINAL_EVENTS.has(event.eventKind) ? 'TASK_TERMINAL' : 'NON_DELTA_EVENT');
        if (TERMINAL_EVENTS.has(event.eventKind)) terminalTasks.add(event.taskId);
        return { accepted: true, kind: 'fact', closed, warnings: emittedWarnings };
      }

      const data = event.data || {};
      if (!validDelta(data)) {
        close('INVALID_DELTA');
        warn('INVALID_DELTA', event, emittedWarnings);
        return { accepted: false, reason: 'invalid_delta', warnings: emittedWarnings };
      }
      if (terminalTasks.has(event.taskId)) {
        warn('LATE_DELTA_AFTER_TERMINAL', event, emittedWarnings);
        return { accepted: false, reason: 'late', warnings: emittedWarnings };
      }

      if (active && active.taskId !== event.taskId) close('TASK_SWITCH');
      if (active && active.requestId !== data.requestId) close('REQUEST_SWITCH');
      if (!active && data.index !== 0) {
        warn('INDEX_GAP', event, emittedWarnings);
        return { accepted: false, reason: 'index_gap', warnings: emittedWarnings };
      }
      if (active && data.index !== active.expectedIndex) {
        const outOfOrder = data.index < active.expectedIndex;
        close(outOfOrder ? 'OUT_OF_ORDER' : 'INDEX_GAP');
        warn(outOfOrder ? 'INDEX_OUT_OF_ORDER' : 'INDEX_GAP', event, emittedWarnings);
        return { accepted: false, reason: outOfOrder ? 'index_out_of_order' : 'index_gap', warnings: emittedWarnings };
      }

      const appended = appendChunk(event, data, emittedWarnings);
      if (data.isFinal === true) close('FINAL_FLAG');
      return { accepted: true, kind: 'delta', blocks: appended, warnings: emittedWarnings };
    }

    function appendChunk(event, data, emittedWarnings) {
      let remaining = data.chunk;
      const changed = [];
      const taskBytes = messageBytesByTask.get(event.taskId) || 0;
      if (taskBytes >= messageLimitBytes) {
        warn('MESSAGE_LIMIT', event, emittedWarnings);
        return changed;
      }
      if (!active) active = createBlock(event, data, 0);

      while (remaining.length > 0) {
        const currentTaskBytes = messageBytesByTask.get(event.taskId) || 0;
        const messageCapacity = messageLimitBytes - currentTaskBytes;
        const segmentCapacity = segmentLimitBytes - active.bytes;
        const capacity = Math.min(messageCapacity, segmentCapacity);
        if (capacity <= 0) {
          if (messageCapacity <= 0) {
            active.truncated = true;
            close('MESSAGE_LIMIT');
            warn('MESSAGE_LIMIT', event, emittedWarnings);
            break;
          }
          const continuation = active.continuation + 1;
          close('SEGMENT_LIMIT');
          active = createBlock(event, data, continuation);
          continue;
        }
        const part = takeUtf8Prefix(remaining, capacity);
        if (!part.text) {
          active.truncated = true;
          close('MESSAGE_LIMIT');
          warn('MESSAGE_LIMIT', event, emittedWarnings);
          break;
        }
        active.text += part.text;
        active.bytes += part.bytes;
        active.indexTo = data.index;
        active.sourceSeqTo = event.sequence;
        active.expectedIndex = data.index + 1;
        messageBytesByTask.set(event.taskId, currentTaskBytes + part.bytes);
        if (!changed.includes(active)) changed.push(active);
        remaining = remaining.slice(part.codeUnits);
        if (active.bytes >= segmentLimitBytes && remaining.length > 0) {
          const continuation = active.continuation + 1;
          close('SEGMENT_LIMIT');
          active = createBlock(event, data, continuation);
        }
      }
      if (data.chunk.length === 0 && active) {
        active.indexTo = data.index;
        active.sourceSeqTo = event.sequence;
        active.expectedIndex = data.index + 1;
        if (!changed.includes(active)) changed.push(active);
      }
      return changed.map(cloneBlock);
    }

    function createBlock(event, data, continuation) {
      blockCounter += 1;
      const block = {
        schemaVersion: 1,
        blockId: `assistant-${event.taskId}-${data.requestId}-${blockCounter}`,
        taskId: event.taskId,
        requestId: data.requestId,
        indexFrom: data.index,
        indexTo: data.index,
        text: '',
        bytes: 0,
        continuation,
        sourceSeqFrom: event.sequence,
        sourceSeqTo: event.sequence,
        expectedIndex: data.index,
        closedBy: null,
        truncated: false,
      };
      blocks.push(block);
      return block;
    }

    function close(reason) {
      if (!active) return null;
      active.closedBy = reason;
      const closed = cloneBlock(active);
      active = null;
      return closed;
    }

    function warn(code, event, emitted) {
      const warning = { code, eventId: event.eventId, taskId: event.taskId, sequence: event.sequence };
      warnings.push(warning);
      if (warnings.length > 64) warnings.shift();
      emitted.push(warning);
    }

    return Object.freeze({
      push,
      close: (reason) => close(reason || 'PROJECTION_RESET'),
      snapshot: () => ({
        schemaVersion: 1,
        blocks: blocks.map(cloneBlock),
        warnings: warnings.slice(),
        sourceSeqTo: lastSequence,
      }),
      hasGatewayContent: (taskId) => blocks.some((block) => block.taskId === taskId && block.text.length > 0),
    });
  }

  function validEvent(event) {
    return Boolean(event && typeof event.eventId === 'string' && typeof event.taskId === 'string' &&
      typeof event.eventKind === 'string' && Number.isInteger(event.sequence) && event.sequence > 0);
  }

  function validDelta(data) {
    return Boolean(data && data.schemaVersion === 1 && typeof data.requestId === 'string' && data.requestId.length > 0 &&
      Number.isInteger(data.index) && data.index >= 0 && typeof data.chunk === 'string' && typeof data.isFinal === 'boolean');
  }

  function fingerprint(event) {
    try { return stableJson(event); } catch (_error) { return String(event.eventId); }
  }

  function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  function positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  function utf8ByteLength(text) {
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function takeUtf8Prefix(text, maxBytes) {
    let bytes = 0;
    let codeUnits = 0;
    while (codeUnits < text.length) {
      const first = text.charCodeAt(codeUnits);
      const width = first < 0x80 ? 1 : first < 0x800 ? 2 : first >= 0xD800 && first <= 0xDBFF && codeUnits + 1 < text.length && text.charCodeAt(codeUnits + 1) >= 0xDC00 && text.charCodeAt(codeUnits + 1) <= 0xDFFF ? 4 : 3;
      const units = width === 4 ? 2 : 1;
      if (bytes + width > maxBytes) break;
      bytes += width;
      codeUnits += units;
    }
    return { text: text.slice(0, codeUnits), bytes, codeUnits };
  }

  function cloneBlock(block) {
    return {
      schemaVersion: block.schemaVersion,
      blockId: block.blockId,
      taskId: block.taskId,
      requestId: block.requestId,
      indexFrom: block.indexFrom,
      indexTo: block.indexTo,
      text: block.text,
      bytes: block.bytes,
      continuation: block.continuation,
      sourceSeqFrom: block.sourceSeqFrom,
      sourceSeqTo: block.sourceSeqTo,
      closedBy: block.closedBy,
      truncated: block.truncated,
    };
  }

  root.win7AgentConversationProjector = Object.freeze({ create, utf8ByteLength });
}(window));
