import { Aipp } from '../sdk/aipp-node/src/client';

async function run() {
  console.log('Testing AIPP Node.js SDK...');
  
  // Use a dummy key for testing or standard error handling
  const aipp = new Aipp({
    apiKey: 'aipp_merch_testkey123',
    baseUrl: 'http://localhost:3000' // test locally if running
  });

  try {
    const charge = await aipp.createCharge({ amountSats: 100, memo: 'Test SDK Charge' });
    console.log('Charge created successfully:', charge);

    const status = await aipp.getCharge(charge.payment_hash);
    console.log('Charge status:', status);
  } catch (error) {
    console.error('Expected error since backend might not be running or key is fake:', error.message);
  }
}

run();
