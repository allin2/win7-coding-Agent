'use strict';

(function exposeComposerController(root) {
  function normalizeMode(value) {
    return value === 'plan' ? 'plan' : 'direct';
  }

  function shouldSubmit(event) {
    return Boolean(event && event.key === 'Enter' && event.shiftKey !== true && event.altKey !== true &&
      event.ctrlKey !== true && event.metaKey !== true && event.isComposing !== true);
  }

  function handleKeydown(event, submit) {
    if (!shouldSubmit(event)) return false;
    event.preventDefault();
    submit();
    return true;
  }

  root.win7AgentComposerController = Object.freeze({ normalizeMode, shouldSubmit, handleKeydown });
}(window));
