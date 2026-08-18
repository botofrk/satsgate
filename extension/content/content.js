// AIPP Content Script — element picker for a real, previously minted Smart Tag.
(function () {
  if (globalThis.__aippContentScriptLoaded) return;
  globalThis.__aippContentScriptLoaded = true;

  let pickerActive = false;
  let hoverTarget = null;
  let tag = null;

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action !== 'START_PICKER') return;
    if (!request.tagId || !request.checkoutUrl) {
      sendResponse({ status: 'ERROR', error: 'A real Smart Tag is required.' });
      return;
    }
    tag = {
      id: request.tagId,
      checkoutUrl: request.checkoutUrl,
      price: Number(request.price) || 0.10
    };
    enablePicker();
    sendResponse({ status: 'PICKER_ENABLED' });
  });

  function enablePicker() {
    if (pickerActive) disablePicker();
    pickerActive = true;
    document.body.classList.add('aipp-picker-active');
    showToast(`Select an element for Smart Tag ${tag.id}. Press ESC to cancel.`);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function disablePicker() {
    pickerActive = false;
    document.body.classList.remove('aipp-picker-active');
    if (hoverTarget) hoverTarget.classList.remove('aipp-picker-hover');
    hoverTarget = null;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function showToast(message, timeout = 0) {
    let toast = document.getElementById('aipp-picker-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'aipp-picker-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    if (timeout) setTimeout(() => { toast.style.display = 'none'; }, timeout);
  }

  function onMouseOver(event) {
    if (!pickerActive) return;
    event.stopPropagation();
    if (hoverTarget) hoverTarget.classList.remove('aipp-picker-hover');
    hoverTarget = event.target;
    hoverTarget.classList.add('aipp-picker-hover');
  }

  function onMouseOut(event) {
    if (pickerActive && event.target) event.target.classList.remove('aipp-picker-hover');
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && pickerActive) {
      disablePicker();
      showToast('AIPP selection cancelled.', 1800);
    }
  }

  function onClick(event) {
    if (!pickerActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = event.target;
    disablePicker();
    attachPreviewAndCopyEmbed(selected);
  }

  async function attachPreviewAndCopyEmbed(element) {
    if (!element || element === document.body || element === document.documentElement) {
      showToast('Choose a smaller page element.', 2200);
      return;
    }

    const container = document.createElement('div');
    container.className = 'aipp-extension-preview';
    element.parentNode.insertBefore(container, element);
    container.appendChild(element);
    element.classList.add('aipp-locked-element');

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'aipp-paywall-overlay-badge';
    badge.textContent = `Unlock — $${tag.price.toFixed(2)}`;
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.open(tag.checkoutUrl, '_blank', 'noopener,noreferrer');
    });
    container.appendChild(badge);

    const cleanContent = element.cloneNode(true);
    cleanContent.classList.remove('aipp-locked-element', 'aipp-picker-hover');
    const embed = `<div data-aipp-tag="${tag.id}" data-price="$${tag.price.toFixed(2)}">\n${cleanContent.outerHTML}\n</div>\n<script src="https://aipp.dev/aipp-widget.js" async></script>`;

    try {
      await navigator.clipboard.writeText(embed);
      showToast(`Smart Tag ${tag.id} minted. Embed code copied. This page change is only a preview until you paste and publish the code.`, 6000);
    } catch {
      showToast(`Smart Tag ${tag.id} minted. Clipboard access failed.`, 5000);
    }
  }
})();
