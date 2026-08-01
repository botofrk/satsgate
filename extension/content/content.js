// AIPP Content Script — DOM Picker & L402 Autopay Detect
(function() {
  let isPickerActive = false;
  let currentHoverTarget = null;
  let targetLockPrice = 0.10;

  // Listen for messages from Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_PICKER') {
      targetLockPrice = request.price || 0.10;
      enablePicker();
      sendResponse({ status: 'PICKER_ENABLED' });
    }
  });

  function enablePicker() {
    isPickerActive = true;
    showToast(`🎯 AIPP Picker Active: Hover & Click any element to lock ($${targetLockPrice.toFixed(2)}). Press ESC to cancel.`);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function disablePicker() {
    isPickerActive = false;
    hideToast();
    if (currentHoverTarget) {
      currentHoverTarget.classList.remove('aipp-picker-hover');
      currentHoverTarget = null;
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  function showToast(msg) {
    let t = document.getElementById('aipp-picker-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'aipp-picker-toast';
      t.style.position = 'fixed';
      t.style.top = '16px';
      t.style.left = '50%';
      t.style.transform = 'translateX(-50%)';
      t.style.background = '#0f0f11';
      t.style.color = '#ffc700';
      t.style.border = '2px solid #ffc700';
      t.style.padding = '10px 20px';
      t.style.borderRadius = '8px';
      t.style.fontSize = '12px';
      t.style.fontWeight = '700';
      t.style.zIndex = '9999999';
      t.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      t.style.fontFamily = 'sans-serif';
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.style.display = 'block';
  }

  function hideToast() {
    const t = document.getElementById('aipp-picker-toast');
    if (t) t.style.display = 'none';
  }

  function handleMouseOver(e) {
    if (!isPickerActive) return;
    e.stopPropagation();
    if (currentHoverTarget) currentHoverTarget.classList.remove('aipp-picker-hover');
    currentHoverTarget = e.target;
    currentHoverTarget.classList.add('aipp-picker-hover');
  }

  function handleMouseOut(e) {
    if (!isPickerActive) return;
    e.stopPropagation();
    if (e.target) e.target.classList.remove('aipp-picker-hover');
  }

  function handleClick(e) {
    if (!isPickerActive) return;
    e.preventDefault();
    e.stopPropagation();

    const selectedElement = e.target;
    disablePicker();

    // Lock the element
    lockElementWithPaywall(selectedElement, targetLockPrice);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && isPickerActive) {
      disablePicker();
    }
  }

  function lockElementWithPaywall(el, price) {
    // Prevent locking body or html document directly
    if (el === document.body || el === document.documentElement) return;

    // Generate paywall container wrapping selected element
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'block';
    container.style.width = '100%';

    if (el.parentNode && el.parentNode.nodeType === 1) {
      el.parentNode.insertBefore(container, el);
      container.appendChild(el);
    } else {
      return;
    }

    el.classList.add('aipp-locked-element');

    // Create Paywall Badge with addEventListener (CSP compliant)
    const badge = document.createElement('div');
    badge.className = 'aipp-paywall-overlay-badge';
    badge.innerHTML = `🔒 Bu İçeriğin Devamını Oku ($${price.toFixed(2)})`;
    
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(`https://aipp.dev/paywall-demo.html?price=${price}`, '_blank');
    });

    container.appendChild(badge);

    // Generate HTML Embed Snippet & Copy to Clipboard for Editors (Blogger / WordPress)
    const rawContentHtml = el.outerHTML;
    const embedHtml = `<div data-aipp-src="demo" data-aipp-price="${price}">${rawContentHtml}</div>\n<script src="https://aipp.dev/paywall.js"></script>`;

    navigator.clipboard.writeText(embedHtml).then(() => {
      showToast(`✅ Locked! AIPP Paywall code copied to clipboard. Paste into your HTML editor.`);
      setTimeout(hideToast, 4000);
    }).catch(() => {
      showToast(`✅ Locked element on page for $${price.toFixed(2)}!`);
      setTimeout(hideToast, 3000);
    });
  }

  // Auto-Inject paywall.js CDN if page contains data-aipp-src attributes
  if (document.querySelector('[data-aipp-src]')) {
    const s = document.createElement('script');
    s.src = 'https://aipp.dev/paywall.js';
    document.head.appendChild(s);
  }

})();
