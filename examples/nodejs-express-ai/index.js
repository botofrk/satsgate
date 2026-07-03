const express = require('express');
const { Aipp } = require('aipp-node');

const app = express();
app.use(express.json());

// Initialize AIPP Node SDK
const aipp = new Aipp({
  apiKey: process.env.AIPP_API_KEY || 'aipp_merch_your_api_key_here'
});

// A simple in-memory store to track used payment hashes (prevent replay attacks)
const usedHashes = new Set();

app.post('/api/generate', async (req, res) => {
  const { prompt, payment_hash } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // STEP 1: If no payment hash, require payment (L402)
  if (!payment_hash) {
    try {
      const charge = await aipp.createCharge({ amountSats: 100, memo: 'AI Generation Fee' });
      return res.status(402).json({
        error: 'Payment Required',
        message: 'Please pay this lightning invoice to use the AI.',
        payment_request: charge.payment_request,
        payment_hash: charge.payment_hash,
        amount_sats: charge.amount_sats
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to connect to payment gateway' });
    }
  }

  // STEP 2: Verify the payment
  if (usedHashes.has(payment_hash)) {
    return res.status(400).json({ error: 'Payment hash already used for a previous generation.' });
  }

  try {
    const status = await aipp.getCharge(payment_hash);
    
    if (status.status !== 'settled') {
      return res.status(402).json({ error: 'Payment not settled yet.' });
    }

    // Mark as used
    usedHashes.add(payment_hash);

    // STEP 3: Generate AI Content (Mocking Vercel AI SDK / OpenAI call)
    const aiResponse = `Here is the AI generated content for: "${prompt}". You paid 100 sats for this!`;

    return res.json({
      success: true,
      data: aiResponse
    });

  } catch (err) {
    return res.status(400).json({ error: 'Invalid or expired payment hash' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
