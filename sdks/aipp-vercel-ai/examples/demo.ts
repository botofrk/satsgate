import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // Requires @ai-sdk/openai
import { aippTopupTool } from '../src/index';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const AIPP_API_KEY = process.env.AIPP_API_KEY || 'your-aipp-api-key';
const AIPP_BASE_URL = process.env.AIPP_BASE_URL || 'https://api.aipp.dev';

async function main() {
  console.log('🤖 Initializing Vercel AI SDK Agent with AIPP Tool...\n');

  // Helper to check current balance
  async function checkBalance() {
    try {
      const res = await axios.get(`${AIPP_BASE_URL}/v1/balance`, {
        headers: { 'X-Api-Key': AIPP_API_KEY }
      });
      return res.data.credits;
    } catch (e: any) {
      console.error(`❌ Failed to check balance: ${e.message}`);
      return 0;
    }
  }

  const currentBalance = await checkBalance();
  console.log(`💰 Current AIPP Balance: ${currentBalance} credits\n`);

  // Define the tool
  const tools = {
    topup: aippTopupTool({
      apiKey: AIPP_API_KEY,
      baseUrl: AIPP_BASE_URL,
      walletType: 'alby',
      // Uses process.env.ALBY_BEARER_TOKEN implicitly if not provided
    }),
  };

  const prompt = `
  My current AIPP credit balance is ${currentBalance}.
  If the balance is strictly less than 5, please use the topup tool to buy more credits (use the 'starter' plan).
  If the balance is 5 or more, just reply that I have enough credits and no action is needed.
  `;

  console.log('🚀 Sending prompt to agent...');
  console.log(prompt);

  try {
    const { text, steps } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      maxSteps: 5, // Allow the agent to call tools and then respond
      prompt,
    });

    console.log('\n🎯 Agent Response:');
    console.log(text);

    // If the tool was called, we can check the balance again
    const finalBalance = await checkBalance();
    console.log(`\n💰 Final AIPP Balance: ${finalBalance} credits`);
  } catch (error: any) {
    console.error('❌ Execution error:', error.message);
  }
}

main().catch(console.error);
