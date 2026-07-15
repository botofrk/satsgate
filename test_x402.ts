process.env.PORT = '3005';
process.env.DB_PATH = ':memory:';

import { initDb, getDb } from './src/config/database';
import { getGatewayAddress } from './src/services/base';

async function runTests() {
  console.log("=== Starting x402 E2E Integration Tests ===");

  // 1. Initialize database
  const db = await initDb();
  console.log("✓ Database initialized.");

  // Clean old test data
  await db.run("DELETE FROM merchants WHERE ln_address = 'test_merchant@aipp.dev'");

  // 2. Derive gateway address
  const gatewayAddr = getGatewayAddress();
  console.log(`✓ Gateway address derived: ${gatewayAddr}`);
  if (!gatewayAddr || !gatewayAddr.startsWith('0x')) {
    throw new Error("Failed to derive valid gateway address");
  }

  // 3. Register Merchant
  const apiKey = 'aipp_merch_testkey';
  await db.run(
    "INSERT INTO merchants (api_key, ln_address, email, payout_mode, payout_threshold_sats, usdc_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    apiKey,
    'test_merchant@aipp.dev',
    'test@aipp.dev',
    'instant',
    0,
    '0x0123456789012345678901234567890123456789',
    new Date().toISOString()
  );
  console.log("✓ Test merchant registered with usdc_address.");

  // 4. Start Server Programmatically on a test port
  process.env.PORT = '3005';
  process.env.NODE_ENV = 'development';
  
  // Require server to start it
  console.log("Starting test server on port 3005...");
  const server = require('./src/server');

  // Wait 2 seconds for server to bootstrap
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 5. Test Invoice Creation
  console.log("Testing POST /invoice/create...");
  const createRes = await fetch("http://localhost:3005/invoice/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      protocol: "x402",
      amount_usd: 0.05
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create invoice: ${errText}`);
  }

  const createData: any = await createRes.json();
  console.log("✓ Invoice created successfully:", createData);

  if (createData.protocol !== 'x402' || !createData.payment_hash.startsWith('x402_')) {
    throw new Error("Invalid invoice protocol or hash prefix");
  }

  const paymentHash = createData.payment_hash;
  const challengeHeader = createRes.headers.get('PAYMENT-REQUIRED');
  console.log("✓ challengeHeader:", challengeHeader);
  if (!challengeHeader) {
    throw new Error("Missing PAYMENT-REQUIRED header");
  }

  // Parse challenge
  const decodedChallenge = JSON.parse(Buffer.from(challengeHeader, 'base64').toString('utf8'));
  console.log("✓ Decoded challenge:", decodedChallenge);
  if (decodedChallenge.payment_hash !== paymentHash || decodedChallenge.price !== "0.05") {
    throw new Error("Decoded challenge fields mismatch");
  }

  // 6. Test Invoice Status Check (Unpaid)
  console.log("Testing GET /invoice/status/:hash (Unpaid)...");
  const statusRes = await fetch(`http://localhost:3005/invoice/status/${paymentHash}`);
  const statusData: any = await statusRes.json();
  console.log("✓ Status response:", statusData);
  if (statusData.paid !== false || statusData.status !== 'pending') {
    throw new Error("Invoice status should be pending/unpaid");
  }

  // 7. Test Payout Queue Insertion (Mocking Payment verification because we don't have a real tx on-chain)
  console.log("Testing Manual Payout Queueing...");
  // Simulate database payment validation
  await db.run(
    "UPDATE invoices SET status = 'settled', preimage = '0xmocktxhash', payout_status = 'queued' WHERE payment_hash = ?",
    paymentHash
  );

  const jobId = 'mock_job_id_123';
  await db.run(
    "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, usdc_address, usdc_amount, protocol, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'x402', 'pending', ?, ?)",
    jobId,
    paymentHash,
    apiKey,
    0,
    '0x0123456789012345678901234567890123456789',
    0.05,
    new Date().toISOString(),
    new Date().toISOString()
  );
  console.log("✓ Simulated settled invoice and queued payout.");

  // Verify payout queue record
  const queueRecord = await db.get("SELECT * FROM payout_queue WHERE id = ?", jobId);
  console.log("✓ Queue record:", queueRecord);
  if (queueRecord.usdc_amount !== 0.05 || queueRecord.protocol !== 'x402') {
    throw new Error("Invalid queue record USDC amount or protocol");
  }

  console.log("=== All x402 E2E Integration Tests PASSED successfully! ===");
  process.exit(0);
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
