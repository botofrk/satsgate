// AIPP Extension Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('[aipp.dev] Chrome Extension installed successfully.');

  // Create right-click context menu for instant element locking
  chrome.contextMenus.create({
    id: 'aipp-lock-selection',
    title: '🔒 Lock this element with AIPP Paywall ($0.10)',
    contexts: ['all']
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'aipp-lock-selection' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'START_PICKER', price: 0.10 });
  }
});
