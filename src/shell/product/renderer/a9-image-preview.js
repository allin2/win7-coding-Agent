(function (global) {
  'use strict';
  function create(metadata, fetchPreview) {
    const root = document.createElement('div');
    root.className = 'a9-image-preview';
    const text = document.createElement('p');
    text.textContent = `${metadata.path} · ${metadata.width} × ${metadata.height}` +
      (metadata.resized ? ` → ${metadata.outputWidth} × ${metadata.outputHeight}` : '');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '预览图片';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    let opened = false;
    let generation = 0;
    let image = null;
    button.addEventListener('click', async () => {
      const request = ++generation;
      if (opened) {
        if (image) { image.removeAttribute('src'); image.remove(); image = null; }
        opened = false;
        button.textContent = '预览图片';
        status.textContent = '';
        return;
      }
      opened = true;
      button.textContent = '关闭预览';
      status.textContent = '正在读取…';
      try {
        const response = await fetchPreview(metadata.conversationId, metadata.reference);
        if (request !== generation || !root.isConnected) return;
        const preview = response && response.preview;
        if (!response || response.ok !== true || !preview || typeof preview.dataUrl !== 'string' ||
            !preview.dataUrl.startsWith('data:image/png;base64,') || preview.dataUrl.length > 2800000) {
          throw new Error(response && response.error && response.error.code === 'A9_IMAGE_CHANGED'
            ? '图片已变化，请重新读取。' : '预览已过期或不可用，请重新读取图片。');
        }
        image = document.createElement('img');
        image.alt = metadata.path;
        image.src = preview.dataUrl;
        image.style.maxWidth = '100%';
        image.style.maxHeight = '360px';
        image.style.display = 'block';
        image.addEventListener('error', () => {
          if (request === generation) status.textContent = '图片显示失败。';
        });
        root.appendChild(image);
        status.textContent = '';
      } catch (error) {
        if (request !== generation) return;
        opened = false;
        button.textContent = '重试预览';
        status.textContent = error.message || '预览失败。';
      }
    });
    root.append(text, button, status);
    return root;
  }
  global.A9ImagePreview = { create };
})(typeof window === 'undefined' ? globalThis : window);
