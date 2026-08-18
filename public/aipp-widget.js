/**
 * AIPP Universal Creator Paywall Widget (v1.0.0)
 * Embeddable on sites that permit custom HTML and third-party scripts/iframes.
 * This client-side widget is a visual checkout gate. Do not place a secret in
 * its HTML; use a protected server endpoint or post-payment redirect for data
 * that must not be present in the page source.
 * 
 * Usage:
 * <div id="aipp-paywall" data-tag="p_9c48c15180a1" data-price="$0.01">
 *   <div class="aipp-locked-content">Your premium article / video / download here</div>
 * </div>
 * <script src="https://aipp.dev/aipp-widget.js"></script>
 */

(function () {
  function initAippWidgets() {
    const paywallContainers = document.querySelectorAll('[data-aipp-tag]');

    paywallContainers.forEach(container => {
      if (container.dataset.aippInitialized) return;
      container.dataset.aippInitialized = 'true';

      const tagId = container.dataset.aippTag;
      const customPrice = container.dataset.price || '$0.01';

      // 1. Wrap and blur existing content
      const content = container.innerHTML;
      container.innerHTML = `
        <div style="position: relative; overflow: hidden; border-radius: 12px; border: 1px solid #e6e2dc; background: #faf8f5;">
          <div id="aipp-content-${tagId}" style="filter: blur(8px); pointer-events: none; user-select: none; max-height: 220px; opacity: 0.6; padding: 24px;">
            ${content}
          </div>
          <div id="aipp-overlay-${tagId}" style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(250,248,245,0.7) 0%, #faf8f5 90%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #ffffff; border: 1px solid #e6e2dc; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin-bottom: 12px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#806300" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 17px; font-weight: 800; color: #1a1918; margin-bottom: 6px;">Protected by AIPP Smart Price Tag</h3>
            <p style="font-size: 13px; color: #6b6964; margin-bottom: 16px; max-width: 320px;">Unlock this exclusive article for <strong>${customPrice}</strong> via Bitcoin Lightning or Base USDC.</p>
            <iframe src="https://aipp.dev/embed/${tagId}" style="width: 100%; max-width: 360px; height: 380px; border: none; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);" title="AIPP Checkout"></iframe>
          </div>
        </div>
      `;

      // 2. Listen for unlock events
      const checkoutFrame = container.querySelector('iframe');
      window.addEventListener('message', (event) => {
        if (event.origin !== 'https://aipp.dev' || event.source !== checkoutFrame?.contentWindow) return;
        if (event.data && event.data.aippSettled && event.data.tagId === tagId) {
          const contentEl = document.getElementById(`aipp-content-${tagId}`);
          const overlayEl = document.getElementById(`aipp-overlay-${tagId}`);
          if (contentEl && overlayEl) {
            contentEl.style.filter = 'none';
            contentEl.style.pointerEvents = 'auto';
            contentEl.style.userSelect = 'auto';
            contentEl.style.maxHeight = 'none';
            contentEl.style.opacity = '1';
            overlayEl.style.display = 'none';
          }
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAippWidgets);
  } else {
    initAippWidgets();
  }
})();
