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
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function disablePicker() {
    isPickerActive = false;
    if (currentHoverTarget) {
      currentHoverTarget.classList.remove('aipp-picker-hover');
      currentHoverTarget = null;
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
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
    // Generate paywall container wrapping selected element
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.width = '100%';

    el.parentNode.insertBefore(container, el);
    container.appendChild(el);

    el.classList.add('aipp-locked-element');

    // Create Paywall Badge
    const badge = document.createElement('div');
    badge.className = 'aipp-paywall-overlay-badge';
    badge.innerHTML = `🔒 Unlock for $${price.toFixed(2)} (via Lightning / USDC)`;
    
    badge.onclick = () => {
      window.open(`https://aipp.dev/paywall-demo.html?price=${price}`, '_blank');
    };

    container.appendChild(badge);
  }

  // Auto-Inject paywall.js CDN if page contains data-aipp-src attributes
  if (document.querySelector('[data-aipp-src]')) {
    const s = document.createElement('script');
    s.src = 'https://aipp.dev/paywall.js';
    document.head.appendChild(s);
  }

})();
