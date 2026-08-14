const http = require('http');

const data = JSON.stringify({ ln_address: 'longingsavior14@walletofsatoshi.com' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/merchant/settings',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': 'aipp_merch_0a38484f676d4a7054ef4134ecb0362c',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
