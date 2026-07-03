async function test() {
  const base = 'https://aipp.dev';
  console.log('1. Registering...');
  
  const regRes = await fetch(base + '/merchant/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'E2E Test',
      ln_address: 'satoshi@getalby.com',
      payout_mode: 'manual',
      payout_threshold: 0
    })
  });
  const reg = await regRes.json();
  console.log(reg);
  
  const apiKey = reg.api_key;
  if (!apiKey) {
    console.error('Registration failed');
    process.exit(1);
  }

  console.log('2. Creating Invoice...');
  const invRes = await fetch(base + '/invoice/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ amount_sats: 150 })
  });
  const inv = await invRes.json();
  console.log(inv);

  console.log('3. Payout...');
  const payRes = await fetch(base + '/merchant/payout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey }
  });
  const pay = await payRes.json();
  console.log(pay);
}

test();
