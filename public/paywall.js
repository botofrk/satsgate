// AIPP Paywall Drop-in Component
(function() {
  const AIPP_URL = 'https://aipp.dev'; // Production URL for the backend API to check status
  // Wait, if it's running locally, it should be the same origin?
  // Let's use the origin of the script tag if possible, or default to current origin
  
  // Inject CSS automatically to avoid external dependency issues
  const style = document.createElement('style');
  style.innerHTML = `
/* AIPP Paywall CSS */
.aipp-paywall-container { display: grid; width: 100%; margin: 2rem 0; border-radius: 12px; overflow: hidden; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: rgba(10, 10, 10, 0.02); min-height: 200px; }
.aipp-paywall-content-wrapper { grid-area: 1 / 1; filter: blur(8px); user-select: none; pointer-events: none; opacity: 0.6; max-height: 250px; overflow: hidden; transition: all 0.5s ease-in-out; padding: 1rem; }
.aipp-paywall-content-wrapper.unlocked { filter: blur(0); user-select: auto; pointer-events: auto; opacity: 1; max-height: 10000px; }
.aipp-paywall-overlay { grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(10, 10, 10, 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 10; color: white; text-align: center; padding: 2rem; box-sizing: border-box; transition: opacity 0.5s ease; }
.aipp-paywall-overlay.hidden { opacity: 0; pointer-events: none; }
.aipp-paywall-card { background: rgba(25, 25, 25, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); border-radius: 16px; padding: 2rem; max-width: 450px; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
.aipp-paywall-header { display: flex; flex-direction: column; gap: 0.5rem; }
.aipp-paywall-title { font-size: 1.25rem; font-weight: 600; margin: 0; background: linear-gradient(90deg, #f7931a 0%, #f5d100 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.aipp-paywall-subtitle { font-size: 0.9rem; color: rgba(255, 255, 255, 0.7); margin: 0; }
.aipp-paywall-qr-container { background: white; padding: 1rem; border-radius: 8px; display: flex; justify-content: center; align-items: center; width: 320px; height: 320px; }
.aipp-paywall-qr-container img, .aipp-paywall-qr-container canvas { width: 100% !important; height: 100% !important; object-fit: contain; display: block; }
.aipp-paywall-button { background: #f7931a; color: #111; border: none; border-radius: 8px; padding: 0.75rem 1.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 0.2s, background 0.2s; width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
.aipp-paywall-button:hover { background: #f5d100; transform: translateY(-2px); }
.aipp-paywall-button:active { transform: translateY(0); }
.aipp-paywall-button svg { width: 20px; height: 20px; }
.aipp-paywall-copy { background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid rgba(255, 255, 255, 0.2); }
.aipp-paywall-copy:hover { background: rgba(255, 255, 255, 0.2); color: white; }
.aipp-paywall-loader { border: 3px solid rgba(255, 255, 255, 0.1); border-top: 3px solid #f7931a; border-radius: 50%; width: 24px; height: 24px; animation: aipp-spin 1s linear infinite; margin: 0 auto; }
@keyframes aipp-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.aipp-paywall-status { font-size: 0.85rem; color: rgba(255, 255, 255, 0.6); display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
.aipp-paywall-webln-error { font-size: 0.8rem; color: #ff6b6b; margin-bottom: 0.5rem; }
  `;
  document.head.appendChild(style);

  // Parse JWT token manually to avoid dependencies
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  // Dynamically load QRCode library to ensure zero privacy leaks to external QR generators
  let qrCodePromise = null;
  function loadQrCodeLib() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrCodePromise) return qrCodePromise;
    qrCodePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js';
      script.onload = () => resolve(window.QRCode);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return qrCodePromise;
  }

  async function loadPremiumContent(container, endpoint) {
    let token = localStorage.getItem('aipp_l402_token_' + endpoint);
    let preimage = localStorage.getItem('aipp_l402_preimage_' + endpoint);
    let x402Tx = localStorage.getItem('aipp_x402_tx_' + endpoint);

    // Check expiration
    if (token) {
      const payload = parseJwt(token);
      if (payload && payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        console.warn('AIPP Paywall: Token expired. Removing.');
        localStorage.removeItem('aipp_l402_token_' + endpoint);
        localStorage.removeItem('aipp_l402_preimage_' + endpoint);
        token = null;
        preimage = null;
      }
    }

    const headers = {};
    if (token && preimage) {
      headers['Authorization'] = `L402 ${token}:${preimage}`;
    } else if (x402Tx) {
      headers['Authorization'] = `Bearer ${x402Tx}`;
    }

    try {
      const res = await fetch(endpoint, { headers });
      
      if (res.status === 402) {
        // Check for x402 Challenge first
        const challengeHeader = res.headers.get('PAYMENT-REQUIRED') || res.headers.get('payment-required');
        if (challengeHeader) {
          try {
            const challenge = JSON.parse(atob(challengeHeader));
            if (challenge.scheme === 'exact' && challenge.network === 'base') {
              showX402Paywall(container, endpoint, challenge);
              return;
            }
          } catch (e) {
            console.error("AIPP: Failed to parse x402 challenge:", e);
          }
        }

        // Fallback to L402
        const authHeader = res.headers.get('www-authenticate') || res.headers.get('Www-Authenticate');
        if (authHeader && authHeader.startsWith('L402 ')) {
          const macaroonMatch = authHeader.match(/macaroon="([^"]+)"/);
          const invoiceMatch = authHeader.match(/invoice="([^"]+)"/);
          
          if (macaroonMatch && invoiceMatch) {
            const macaroon = macaroonMatch[1];
            const invoice = invoiceMatch[1];
            
            const payload = parseJwt(macaroon);
            const paymentHash = payload ? payload.payment_hash : null;

            showPaywall(container, endpoint, macaroon, invoice, paymentHash);
          }
        }
      } else if (res.ok) {
        // Success
        const data = await res.json();
        container.innerHTML = data.html || data.content || data.message || "Premium content loaded successfully.";
        container.classList.add('unlocked');
        
        // Remove paywall overlay if exists
        const overlay = container.parentElement.querySelector('.aipp-paywall-overlay');
        if (overlay) overlay.remove();
      }
    } catch (e) {
      console.error("AIPP Paywall Error:", e);
    }
  }

  function showX402Paywall(container, endpoint, challenge) {
    const wrapper = document.createElement('div');
    wrapper.className = 'aipp-paywall-container';
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);

    container.classList.add('aipp-paywall-content-wrapper');

    const overlay = document.createElement('div');
    overlay.className = 'aipp-paywall-overlay';

    const card = document.createElement('div');
    card.className = 'aipp-paywall-card';

    const header = document.createElement('div');
    header.className = 'aipp-paywall-header';
    header.innerHTML = `
      <h3 class="aipp-paywall-title">Premium Content (x402)</h3>
      <p class="aipp-paywall-subtitle">Pay ${challenge.price} USDC on Base to unlock</p>
    `;

    const statusText = document.createElement('div');
    statusText.className = 'aipp-paywall-status';
    statusText.innerHTML = `Waiting for payment...`;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.width = '100%';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '0.5rem';

    const payButton = document.createElement('button');
    payButton.className = 'aipp-paywall-button';
    payButton.style.background = '#3b82f6';
    payButton.style.color = '#fff';
    payButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;">
        <path d="M17 9V7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7V9M5 9H19C20.1046 9 21 9.89543 21 11V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V11C3 9.89543 3.89543 9 5 9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Pay with Web3 Wallet
    `;

    const copyButton = document.createElement('button');
    copyButton.className = 'aipp-paywall-button aipp-paywall-copy';
    copyButton.innerText = 'Copy Address';

    payButton.onclick = async () => {
      try {
        if (!window.ethereum) {
          throw new Error('No Ethereum wallet found. Please install MetaMask or Coinbase Wallet.');
        }

        payButton.disabled = true;
        payButton.innerText = 'Connecting...';

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const from = accounts[0];

        const isSepolia = challenge.token.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
        const chainId = isSepolia ? '0x14a34' : '0x2105';
        const networkName = isSepolia ? 'Base Sepolia' : 'Base Mainnet';
        const rpcUrl = isSepolia ? 'https://sepolia.base.org' : 'https://mainnet.base.org';

        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId,
                chainName: networkName,
                rpcUrls: [rpcUrl],
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                blockExplorerUrls: [isSepolia ? 'https://sepolia.basescan.org' : 'https://basescan.org']
              }],
            });
          } else {
            throw switchError;
          }
        }

        payButton.innerText = 'Approve in Wallet...';
        const amountUnits = Math.round(parseFloat(challenge.price) * 1_000_000);
        
        // ERC20 Transfer transaction
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from,
            to: challenge.token,
            data: '0xa9059cbb' + 
                  challenge.payTo.replace('0x', '').toLowerCase().padStart(64, '0') + 
                  amountUnits.toString(16).padStart(64, '0')
          }]
        });

        console.log('x402 transaction broadcasted:', txHash);
        statusText.innerHTML = `<span style="color:#3b82f6;">Verifying tx on-chain...</span>`;
        payButton.innerText = 'Verifying...';

        // Poll status endpoint with transaction hash
        let verified = false;
        const origin = window.location.origin;
        
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const verifyRes = await fetch(`${origin}/invoice/status/${challenge.payment_hash}?tx_hash=${txHash}`);
            if (verifyRes.ok) {
              const data = await verifyRes.json();
              if (data.paid) {
                verified = true;
                handleX402Success(endpoint, txHash, container, overlay);
                break;
              }
            }
          } catch (e) {
            // Ignore polling errors
          }
        }

        if (!verified) {
          throw new Error('On-chain verification timed out. If transaction was successful, refresh page.');
        }

      } catch (err) {
        console.error("x402 Wallet Error:", err);
        payButton.disabled = false;
        payButton.innerHTML = 'Pay with Web3 Wallet';
        statusText.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${err.message || 'Error occurred.'}</span>`;
      }
    };

    copyButton.onclick = () => {
      navigator.clipboard.writeText(challenge.payTo);
      copyButton.innerText = 'Copied!';
      setTimeout(() => copyButton.innerText = 'Copy Address', 2000);
    };

    buttonContainer.appendChild(payButton);
    buttonContainer.appendChild(copyButton);

    card.appendChild(header);
    card.appendChild(buttonContainer);
    card.appendChild(statusText);
    overlay.appendChild(card);
    wrapper.appendChild(overlay);
  }

  function handleX402Success(endpoint, txHash, container, overlay) {
    localStorage.setItem('aipp_x402_tx_' + endpoint, txHash);
    overlay.innerHTML = `
      <div class="aipp-paywall-card" style="justify-content: center;">
        <div class="aipp-paywall-loader" style="border-top-color:#3b82f6;"></div>
        <p style="margin-top: 1rem;">Unlocking premium content...</p>
      </div>
    `;
    setTimeout(() => {
      loadPremiumContent(container, endpoint);
    }, 1000);
  }

  function showPaywall(container, endpoint, macaroon, invoice, paymentHash) {
    // Wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'aipp-paywall-container';
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);

    container.classList.add('aipp-paywall-content-wrapper');

    const overlay = document.createElement('div');
    overlay.className = 'aipp-paywall-overlay';

    const card = document.createElement('div');
    card.className = 'aipp-paywall-card';

    const header = document.createElement('div');
    header.className = 'aipp-paywall-header';
    header.innerHTML = `
      <h3 class="aipp-paywall-title">Premium Content</h3>
      <p class="aipp-paywall-subtitle">Pay with Lightning to unlock</p>
    `;

    const qrContainer = document.createElement('div');
    qrContainer.className = 'aipp-paywall-qr-container';
    const qrCanvas = document.createElement('canvas');
    qrContainer.appendChild(qrCanvas);
    
    // Draw QR Code locally
    loadQrCodeLib().then(QRCode => {
      QRCode.toCanvas(qrCanvas, invoice.toUpperCase(), {
        width: 600,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#000000', light: '#ffffff' }
      }, (error) => {
        if (error) console.error('AIPP Paywall QR generation failed:', error);
      });
    }).catch(err => {
      qrContainer.innerHTML = '<span style="color:#ff6b6b;font-size:12px;">Failed to load QR code.</span>';
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.style.width = '100%';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '0.5rem';

    const payButton = document.createElement('button');
    payButton.className = 'aipp-paywall-button';
    payButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 10V3L4 14H11V21L20 10H13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Pay via WebLN
    `;

    const copyButton = document.createElement('button');
    copyButton.className = 'aipp-paywall-button aipp-paywall-copy';
    copyButton.innerText = 'Copy Invoice';

    const statusText = document.createElement('div');
    statusText.className = 'aipp-paywall-status';
    statusText.innerHTML = `Waiting for payment...`;

    let polling = true;

    payButton.onclick = async () => {
      try {
        if (!window.webln) {
          throw new Error('WebLN not found. Please use a Lightning wallet extension like Alby.');
        }
        await window.webln.enable();
        const response = await window.webln.sendPayment(invoice);
        
        if (response && response.preimage) {
          polling = false; // Stop polling
          handlePaymentSuccess(endpoint, macaroon, response.preimage, container, overlay);
        }
      } catch (err) {
        console.error("WebLN Error:", err);
        const errorMsg = document.createElement('div');
        errorMsg.className = 'aipp-paywall-webln-error';
        errorMsg.innerText = err.message || 'Payment failed or rejected. Please scan the QR code manually.';
        statusText.innerHTML = '';
        statusText.appendChild(errorMsg);
      }
    };

    copyButton.onclick = () => {
      navigator.clipboard.writeText(invoice);
      copyButton.innerText = 'Copied!';
      setTimeout(() => copyButton.innerText = 'Copy Invoice', 2000);
    };

    // If WebLN isn't detected, hide the WebLN button
    if (!window.webln) {
      payButton.style.display = 'none';
    }

    buttonContainer.appendChild(payButton);
    buttonContainer.appendChild(copyButton);

    card.appendChild(header);
    card.appendChild(qrContainer);
    card.appendChild(buttonContainer);
    card.appendChild(statusText);
    overlay.appendChild(card);
    wrapper.appendChild(overlay);

    // Polling for manual QR payment
    if (paymentHash) {
      const pollInterval = setInterval(async () => {
        if (!polling) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const origin = window.location.origin;
          const statusRes = await fetch(`${origin}/invoice/status/${paymentHash}`);
          if (statusRes.ok) {
            const data = await statusRes.json();
            if (data.paid && data.preimage) {
              clearInterval(pollInterval);
              polling = false;
              handlePaymentSuccess(endpoint, macaroon, data.preimage, container, overlay);
            }
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 3000);
    }
  }

  function handlePaymentSuccess(endpoint, macaroon, preimage, container, overlay) {
    localStorage.setItem('aipp_l402_token_' + endpoint, macaroon);
    localStorage.setItem('aipp_l402_preimage_' + endpoint, preimage);
    
    overlay.innerHTML = `
      <div class="aipp-paywall-card" style="justify-content: center;">
        <div class="aipp-paywall-loader"></div>
        <p style="margin-top: 1rem;">Unlocking premium content...</p>
      </div>
    `;
    
    setTimeout(() => {
      loadPremiumContent(container, endpoint);
    }, 1000);
  }

  // Initialize all elements with data-aipp-src
  document.addEventListener('DOMContentLoaded', () => {
    const paywalls = document.querySelectorAll('[data-aipp-src]');
    paywalls.forEach(pw => {
      const endpoint = pw.getAttribute('data-aipp-src');
      if (endpoint) {
        loadPremiumContent(pw, endpoint);
      }
    });
  });

})();
