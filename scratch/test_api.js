const http = require('http');
const https = require('https');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;

    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING AIPP PAYMENT BRIDGE INTEGRATION TESTS ===\n');

  try {
    // 1. Health check
    console.log('1. Testing /health...');
    const health = await request(`${BASE_URL}/health`);
    console.log('Health response:', health.body);
    if (health.status !== 200 || health.body.status !== 'ok') {
      throw new Error('Health check failed');
    }
    console.log('Health check PASSED\n');

    // 2. Topup request
    console.log('2. Testing /topup (mock demo payment)...');
    const topup = await request(`${BASE_URL}/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { amount_sats: 500 });
    
    console.log('Topup response:', topup.body);
    if (topup.status !== 200 || !topup.body.payment_hash) {
      throw new Error('Topup request failed');
    }
    const paymentHash = topup.body.payment_hash;
    console.log('Topup request PASSED\n');

    // 3. Confirm payment
    console.log(`3. Confirming payment for hash ${paymentHash}...`);
    const confirm = await request(`${BASE_URL}/confirm/${paymentHash}`);
    console.log('Confirm response:', confirm.body);
    if (confirm.status !== 200 || !confirm.body.api_key) {
      throw new Error('Confirm request failed');
    }
    const apiKey = confirm.body.api_key;
    console.log('Confirm payment PASSED\n');

    // 4. Send generic request proxying to local test target
    console.log(`4. Sending proxy request via /request to http://localhost:${PORT}/test-target...`);
    const proxyTest = await request(`${BASE_URL}/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AIPP-Key': apiKey,
        'X-Target-URL': `http://127.0.0.1:${PORT}/test-target`
      }
    }, {
      hello: 'from aipp bridge',
      test: true
    });

    console.log('Proxy response status:', proxyTest.status);
    if (proxyTest.status !== 200) {
      throw new Error(`Proxy request failed with status ${proxyTest.status}`);
    }
    console.log('Proxy response:', JSON.stringify(proxyTest.body, null, 2));
    if (!proxyTest.body.success || proxyTest.body.body.hello !== 'from aipp bridge') {
      throw new Error('Echo payload mismatch');
    }
    console.log('Proxy request forwarding PASSED\n');

    // 5. Check balance
    console.log('5. Checking updated balance...');
    const balance = await request(`${BASE_URL}/balance`, {
      headers: { 'X-AIPP-Key': apiKey }
    });
    console.log('Balance response:', balance.body);
    if (balance.status !== 200 || balance.body.balance_sats !== 495) {
      throw new Error(`Balance check failed. Expected 495 sats (500 - 5 flat fee), got ${balance.body.balance_sats}`);
    }
    console.log('Balance check PASSED\n');

    // 6. Check transactions ledger
    console.log('6. Checking transactions ledger...');
    const txs = await request(`${BASE_URL}/transactions`, {
      headers: { 'X-AIPP-Key': apiKey }
    });
    console.log('Transactions response count:', txs.body.length);
    console.log('Transactions list:', JSON.stringify(txs.body, null, 2));
    if (txs.status !== 200 || txs.body.length !== 2) {
      throw new Error(`Transactions check failed. Expected 2 entries (topup + request), got ${txs.body.length}`);
    }
    if (txs.body[0].type !== 'request' || txs.body[1].type !== 'topup') {
      throw new Error('Transaction sorting or type mismatch');
    }
    console.log('Transactions check PASSED\n');

    // 7. Check stats aggregation
    console.log('7. Checking stats aggregation...');
    const stats = await request(`${BASE_URL}/stats`, {
      headers: { 'X-AIPP-Key': apiKey }
    });
    console.log('Stats response:', JSON.stringify(stats.body, null, 2));
    if (stats.status !== 200 || stats.body.length === 0) {
      throw new Error('Stats aggregation failed');
    }
    console.log('Stats check PASSED\n');

    console.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err.message);
    process.exit(1);
  }
}

// Run tests
runTests();
