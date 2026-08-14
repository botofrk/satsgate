// AIPP Chrome Extension Popup Logic
const AIPP_API = 'https://aipp.dev';

// Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  const btn = document.getElementById(`tab-${tabName}`);
  const panel = document.getElementById(`panel-${tabName}`);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
}
window.switchTab = switchTab;

// Initialize Event Listeners on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // One-time migration from the old cloud-synced storage to local-only storage.
  const localSettings = await chrome.storage.local.get(['ln_address', 'evm_address', 'api_key']);
  if (!localSettings.api_key && !localSettings.ln_address && !localSettings.evm_address) {
    const legacySettings = await chrome.storage.sync.get(['ln_address', 'evm_address', 'api_key']);
    if (legacySettings.api_key || legacySettings.ln_address || legacySettings.evm_address) {
      await chrome.storage.local.set(legacySettings);
      await chrome.storage.sync.remove(['ln_address', 'evm_address', 'api_key']);
    }
  }

  // Bind tab click handlers
  const tabCreator = document.getElementById('tab-creator');
  const tabLinks = document.getElementById('tab-links');
  const tabSettings = document.getElementById('tab-settings');

  if (tabCreator) tabCreator.addEventListener('click', () => switchTab('creator'));
  if (tabLinks) tabLinks.addEventListener('click', () => switchTab('links'));
  if (tabSettings) tabSettings.addEventListener('click', () => switchTab('settings'));

  // Bind action buttons
  const startPickerBtn = document.getElementById('start-picker-btn');
  if (startPickerBtn) startPickerBtn.addEventListener('click', startDOMPicker);

  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

  const genLinkBtn = document.getElementById('gen-link-btn');
  if (genLinkBtn) genLinkBtn.addEventListener('click', generateQuickLink);

  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyGeneratedLink);
  const copyAgentBtn = document.getElementById('copy-agent-btn');
  if (copyAgentBtn) copyAgentBtn.addEventListener('click', copyAgentManifest);

  const existingKeyBtn = document.getElementById('existing-key-btn');
  const apiKeyInput = document.getElementById('setting-api-key');
  if (existingKeyBtn && apiKeyInput) {
    existingKeyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      apiKeyInput.removeAttribute('readonly');
      apiKeyInput.style.color = '#0f0f11';
      apiKeyInput.focus();
    });
  }

  const goDashboardBtn = document.getElementById('go-dashboard-btn');
  if (goDashboardBtn) {
    goDashboardBtn.addEventListener('click', async () => {
      window.open('https://aipp.dev/dashboard.html', '_blank', 'noopener,noreferrer');
    });
  }

  // Restore Quick Link form state
  const quickLinkTitle = document.getElementById('link-title');
  const quickLinkAmount = document.getElementById('link-amount');
  const quickLinkTarget = document.getElementById('link-target');
  
  if (localStorage.getItem('draft_link_title')) quickLinkTitle.value = localStorage.getItem('draft_link_title');
  if (localStorage.getItem('draft_link_amount')) quickLinkAmount.value = localStorage.getItem('draft_link_amount');
  if (localStorage.getItem('draft_link_target')) quickLinkTarget.value = localStorage.getItem('draft_link_target');

  // Save Quick Link form state on input
  quickLinkTitle.addEventListener('input', () => localStorage.setItem('draft_link_title', quickLinkTitle.value));
  quickLinkAmount.addEventListener('input', () => localStorage.setItem('draft_link_amount', quickLinkAmount.value));
  quickLinkTarget.addEventListener('input', () => localStorage.setItem('draft_link_target', quickLinkTarget.value));

  // Live Earnings Calculator
  const lockPriceInput = document.getElementById('lock-price');
  const earningsDisplay = document.getElementById('earnings-display');
  if (lockPriceInput && earningsDisplay) {
    const updateEarnings = () => {
      let raw = (lockPriceInput.value || '').replace(',', '.').trim();
      let val = raw === '' ? 0.10 : parseFloat(raw);
      if (isNaN(val) || val < 0) val = 0;
      earningsDisplay.textContent = `Listed merchant price: $${val.toFixed(2)} (buyer fee shown at checkout)`;
    };
    lockPriceInput.addEventListener('input', updateEarnings);
    updateEarnings();
  }

  // Load saved settings
  const data = await chrome.storage.local.get(['ln_address', 'evm_address', 'api_key']);
  if (data.ln_address) document.getElementById('setting-ln-address').value = data.ln_address;
  if (data.evm_address) document.getElementById('setting-evm-address').value = data.evm_address;
  if (data.api_key) document.getElementById('setting-api-key').value = data.api_key;
});

// Save Settings
window.saveSettings = async function() {
  const ln_address = document.getElementById('setting-ln-address').value.trim();
  const evm_address = document.getElementById('setting-evm-address').value.trim();
  let api_key = document.getElementById('setting-api-key').value.trim();

  if (!ln_address && !evm_address && !api_key) {
    alert('Please enter at least a Lightning Address or Base Address.');
    return;
  }

  // Auto-generate Tag ID (API Key) if missing but user provided a wallet
  if (!api_key && (ln_address || evm_address)) {
    document.getElementById('connection-status').textContent = 'Registering...';
    try {
      const payload = {};
      if (ln_address) payload.ln_address = ln_address;
      if (evm_address) payload.usdc_address = evm_address;

      const res = await fetch(`${AIPP_API}/merchant/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok && data.api_key) {
        api_key = data.api_key;
        document.getElementById('setting-api-key').value = api_key;
      } else if (res.status === 409) {
        alert('This wallet is already registered. Please click "Already have one?" and enter your existing AIPP Tag ID.');
        document.getElementById('connection-status').textContent = 'Ready';
        return;
      } else {
        alert('Registration error: ' + (data.error || 'Unknown error'));
        document.getElementById('connection-status').textContent = 'Ready';
        return;
      }
    } catch (e) {
      alert('Network error connecting to AIPP server.');
      document.getElementById('connection-status').textContent = 'Ready';
      return;
    }
  }

  await chrome.storage.local.set({ ln_address, evm_address, api_key });
  document.getElementById('connection-status').textContent = 'Saved ✓';
  setTimeout(() => {
    document.getElementById('connection-status').textContent = 'Ready';
  }, 1500);
};

// Start DOM Element Picker (on-demand injection via activeTab / scripting)
window.startDOMPicker = async function() {
  const rawPrice = (document.getElementById('lock-price').value || '').replace(',', '.').trim();
  const price = rawPrice === '' ? 0.10 : Number(rawPrice);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!Number.isFinite(price) || price < 0.01 || price > 100) {
    alert('Price must be between $0.01 and $100.00.');
    return;
  }

  if (!tab || !tab.id) {
    alert('No active web page found.');
    return;
  }

  // Prevent injecting into chrome:// internal pages
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:'))) {
    alert('Cannot attach Smart Tag on browser system pages. Open any regular website to test.');
    return;
  }

  const saved = await chrome.storage.local.get(['api_key']);
  if (!saved.api_key) {
    alert('Set your AIPP API key in Payout Wallet first.');
    switchTab('settings');
    return;
  }

  let mintedTag;
  try {
    const response = await fetch(`${AIPP_API}/merchant/links/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': saved.api_key },
      body: JSON.stringify({
        title: `Unlock: ${(tab.title || 'Protected page element').slice(0, 110)}`,
        amount_usd: price,
        redirect_url: tab.url,
        capability_type: 'link'
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Tag creation failed (${response.status})`);
    mintedTag = body;
  } catch (error) {
    alert(`Could not mint Smart Tag: ${error.message}`);
    return;
  }

  try {
    // Inject styles and script on demand on active tab
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    });
  } catch (_) {
    // Script may already be injected
  }

  // Send message to content script to activate picker
  chrome.tabs.sendMessage(tab.id, {
    action: 'START_PICKER',
    price,
    tagId: mintedTag.id,
    checkoutUrl: mintedTag.url || `${AIPP_API}/t/${mintedTag.id}`
  }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Could not activate picker on this page. Please refresh the page and try again.');
      return;
    }
    document.getElementById('picker-status-box').style.display = 'block';
  });
};

// Generate Quick Payment Link
window.generateQuickLink = async function() {
  const title = document.getElementById('link-title').value.trim();
  const rawAmount = (document.getElementById('link-amount').value || '').replace(',', '.');
  const amount = parseFloat(rawAmount);
  const redirect = document.getElementById('link-target').value.trim();

  const data = await chrome.storage.local.get(['api_key']);
  if (!data.api_key) {
    alert('Please set your AIPP API Key in settings tab first.');
    switchTab('settings');
    return;
  }

  if (!title || !Number.isFinite(amount) || amount < 0.01 || amount > 100 || !redirect) {
    alert('Please fill in title, price, and target URL.');
    return;
  }

  try {
    const parsed = new URL(redirect);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
  } catch {
    alert('Target Content URL must be a valid http(s) URL.');
    return;
  }

  try {
    const res = await fetch(`${AIPP_API}/merchant/links/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': data.api_key
      },
      body: JSON.stringify({ title, amount_usd: amount, redirect_url: redirect, capability_type: 'link' })
    });

    if (res.ok) {
      // Clear draft data since it succeeded
      localStorage.removeItem('draft_link_title');
      localStorage.removeItem('draft_link_amount');
      localStorage.removeItem('draft_link_target');
    }

    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || `Failed to create link (${res.status})`);

    document.getElementById('generated-link-input').value = result.url || `${AIPP_API}/t/${result.id}`;
    document.getElementById('generated-link-input').dataset.manifestUrl = result.manifest_url || `${AIPP_API}/t/${result.id}/manifest`;
    document.getElementById('link-result-box').style.display = 'block';
  } catch (e) {
    alert('Error generating payment link: ' + e.message);
  }
};

window.copyGeneratedLink = function() {
  const input = document.getElementById('generated-link-input');
  navigator.clipboard.writeText(input.value).then(() => {
    alert('Paywall Link copied to clipboard!');
  });
};

window.copyAgentManifest = function() {
  const input = document.getElementById('generated-link-input');
  navigator.clipboard.writeText(input.dataset.manifestUrl || `${input.value}/manifest`).then(() => {
    alert('Agent manifest URL copied!');
  });
};
