/* A9-42: data-only question UI. Host owns identity, persistence and authorization. */
(function (global) {
  'use strict';
  function create(root, reply) {
    let current = null;
    let busy = false;
    let sendingFor = null;
    let selected = '';
    let input;
    let submit;
    let cancel;
    let error;
    let notice;
    let radios = [];
    function element(tag, text, className) {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    function clear(node) {
      node.textContent = '';
    }
    function controls() {
      if (!current) return;
      const disabled = busy || sendingFor === current;
      input.disabled = disabled;
      radios.forEach((radio) => { radio.disabled = disabled; });
      submit.disabled = disabled || !(input.value.trim() || selected);
      cancel.disabled = disabled;
      submit.textContent = disabled ? '正在提交…' : '回答并继续';
    }
    function showNotice(message, isError) {
      error.textContent = message || '';
      error.hidden = !message;
      if (message && isError) error.setAttribute('role', 'alert');
      else error.removeAttribute('role');
    }
    async function send(decision) {
      if (!current || busy || sendingFor === current) return;
      const answer = input.value.trim() || selected;
      if (decision === 'answered' && !answer) return;
      const pending = current;
      sendingFor = pending;
      showNotice('', false);
      root.setAttribute('aria-busy', 'true');
      controls();
      try {
        const response = await reply({ conversationId: pending.conversationId, questionId: pending.questionId,
          revision: pending.revision, decision,
          ...(decision === 'answered' ? { answer } : {}) });
        if (!response || response.ok !== true) {
          throw new Error(response && response.error && response.error.message
            ? response.error.message : '提交失败，请重试。');
        }
        if (current === pending) update(null);
      } catch (failure) {
        if (current === pending) showNotice(failure && failure.message ? failure.message : '提交失败，请重试。', true);
      } finally {
        if (sendingFor === pending) sendingFor = null;
        if (current === pending) {
          root.setAttribute('aria-busy', busy ? 'true' : 'false');
          controls();
        }
      }
    }
    function update(pending, blocked) {
      root.hidden = !pending;
      if (!pending) { current = null; clear(root); return; }
      if (current && current.questionId === pending.questionId && current.revision === pending.revision &&
          current.conversationId === pending.conversationId) {
        busy = Boolean(blocked);
        controls();
        return;
      }
      current = pending;
      busy = Boolean(blocked);
      selected = '';
      radios = [];
      clear(root);
      root.classList.add('a9-question-card');
      root.setAttribute('aria-busy', busy ? 'true' : 'false');
      root.appendChild(element('h3', '需要你的补充'));
      root.appendChild(element('p', pending.prompt, 'a9-question-prompt'));
      const group = element('fieldset');
      group.appendChild(element('legend', '选择一项，或填写自己的回答'));
      (pending.options || []).forEach((option) => {
        const label = element('label', '', 'a9-question-option');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'a9-question-option';
        radio.addEventListener('change', () => { selected = option; input.value = ''; controls(); });
        radios.push(radio);
        label.append(radio, element('span', option));
        group.appendChild(label);
      });
      const label = element('label', '自己的回答');
      input = element('textarea');
      input.rows = 3;
      input.maxLength = 2048;
      input.setAttribute('aria-label', '自己的回答');
      input.addEventListener('input', () => {
        selected = '';
        radios.forEach((radio) => { radio.checked = false; });
        controls();
      });
      label.appendChild(input);
      group.appendChild(label);
      root.appendChild(group);
      root.appendChild(element('p', pending.recovered
        ? '这是重启前的问题。回答后会核对当前任务状态，再继续。'
        : '等待时任务已暂停。回答只补充信息，不批准文件或命令操作。', 'a9-question-hint'));
      const actions = element('div', '', 'a9-question-actions');
      submit = element('button', '回答并继续');
      submit.type = 'button';
      submit.addEventListener('click', () => send('answered'));
      cancel = element('button', '取消本次问询');
      cancel.type = 'button';
      cancel.addEventListener('click', () => send('cancelled'));
      actions.append(submit, cancel);
      root.appendChild(actions);
      notice = element('p', pending.recovered
        ? '回答已保存后继续失败或应用已重启；问题仍在等待回答。回答后会核对当前任务状态，再继续。'
        : '', 'a9-question-hint');
      notice.hidden = !pending.recovered;
      root.appendChild(notice);
      error = element('p', '', 'a9-question-error');
      error.hidden = true;
      root.appendChild(error);
      controls();
    }
    return { update };
  }
  global.A9QuestionCard = { create };
})(typeof window === 'undefined' ? globalThis : window);
