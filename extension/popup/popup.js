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

  // Live Earnings Calculator
  const lockPriceInput = document.getElementById('lock-price');
  const earningsDisplay = document.getElementById('earnings-display');
  if (lockPriceInput && earningsDisplay) {
    const updateEarnings = () => {
      const val = parseFloat(lockPriceInput.value) || 0;
      earningsDisplay.textContent = `$${val.toFixed(2)}`;
    };
    lockPriceInput.addEventListener('input', updateEarnings);
    updateEarnings();
  }

  // Load saved settings
  const data = await chrome.storage.sync.get(['ln_address', 'api_key']);
  if (data.ln_address) document.getElementById('setting-ln-address').value = data.ln_address;
  if (data.api_key) document.getElementById('setting-api-key').value = data.api_key;
});

// Save Settings
window.saveSettings = async function() {
  const ln_address = document.getElementById('setting-ln-address').value.trim();
  const api_key = document.getElementById('setting-api-key').value.trim();

  if (!ln_address && !api_key) {
    alert('Please enter at least a Lightning Address or API key.');
    return;
  }

  await chrome.storage.sync.set({ ln_address, api_key });
  document.getElementById('connection-status').textContent = 'Saved ✓';
  setTimeout(() => {
    document.getElementById('connection-status').textContent = 'Ready';
  }, 1500);
};

// Start DOM Element Picker
window.startDOMPicker = async function() {
  const price = parseFloat(document.getElementById('lock-price').value) || 0.10;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    alert('No active web page found.');
    return;
  }

  // Save price in local storage for content script
  await chrome.storage.local.set({ target_lock_price: price });

  // Send message to content script to activate picker
  chrome.tabs.sendMessage(tab.id, { action: 'START_PICKER', price: price }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Could not activate picker on this page. Refresh page and try again.');
      return;
    }
    document.getElementById('picker-status-box').style.display = 'block';
  });
};

// Generate Quick Payment Link
window.generateQuickLink = async function() {
  const title = document.getElementById('link-title').value.trim();
  const amount = parseFloat(document.getElementById('link-amount').value);
  const redirect = document.getElementById('link-target').value.trim();

  const data = await chrome.storage.sync.get(['api_key']);
  if (!data.api_key) {
    alert('Please set your AIPP API Key in settings tab first.');
    switchTab('settings');
    return;
  }

  if (!title || isNaN(amount) || !redirect) {
    alert('Please fill in title, price, and target URL.');
    return;
  }

  try {
    const res = await fetch(`${AIPP_API}/merchant/links/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': data.api_key
      },
      body: JSON.stringify({ title, amount_usd: amount, redirect_url: redirect })
    });

    if (!res.ok) throw new Error('Failed to create link');
    const result = await res.json();

    document.getElementById('generated-link-input').value = result.url || `${AIPP_API}/pay/${result.id}`;
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
