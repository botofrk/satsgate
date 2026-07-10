import { Request, Response, NextFunction } from 'express';
import { getDb } from '../config/database';
import { DEEPSEEK_API_KEY } from '../config/env';
import { AppError } from '../utils/error';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

let knowledgeBase = '';
try {
  knowledgeBase = fs.readFileSync(path.join(process.cwd(), 'AIPP_KNOWLEDGE.md'), 'utf8');
  if (!knowledgeBase.trim()) {
    console.warn('[Chat] AIPP_KNOWLEDGE.md is empty — chat responses will have no knowledge base context.');
  }
} catch (e) {
  // [C-04 FIX] Knowledge base missing is a hard failure in production — chat will be degraded
  console.warn('[Chat] Warning: AIPP_KNOWLEDGE.md not found. Chat responses will be ungrounded.');
}

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: DEEPSEEK_API_KEY
});

const SYSTEM_PROMPT = `
You are the official AIPP (aipp.dev) Support Assistant.
Answer questions based ONLY on the following knowledge base:

${knowledgeBase}

If the user asks something completely outside of this knowledge base, you MUST reply exactly with the word "TICKET_REQUIRED", and nothing else.
If you know the answer, respond in a helpful, concise manner. Use Turkish if the user speaks Turkish, otherwise English. Use markdown formatting.
`;

export const handleChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      throw new AppError('Messages array is required', 400, 'BAD_REQUEST');
    }

    // Guard against unbounded context / cost explosion
    if (messages.length > 20) {
      throw new AppError('Too many messages in context (max 20)', 400, 'TOO_MANY_MESSAGES');
    }
    for (const m of messages) {
      if (typeof m.content !== 'string' || m.content.length > 2000) {
        throw new AppError('Each message must be a string under 2000 characters', 400, 'MESSAGE_TOO_LONG');
      }
    }

    if (!DEEPSEEK_API_KEY) {
      return res.json({ 
        role: 'assistant', 
        content: 'Chat system is currently offline.' 
      });
    }

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    ];

    const completion = await openai.chat.completions.create({
      messages: apiMessages as any,
      model: 'deepseek-chat',
      temperature: 0.1,
    });

    // [C-02 FIX] Guard against empty choices array (content filter hits, API errors)
    const choice = completion.choices?.[0];
    if (!choice?.message?.content) {
      return res.status(503).json({ role: 'assistant', content: 'Service temporarily unavailable. Please try again.' });
    }
    const reply = choice.message.content;

    if (reply.includes('TICKET_REQUIRED')) {
      return res.json({
        role: 'assistant',
        content: "Maalesef bu sorunun cevabı bilgi bankamda yok. Ancak teknik ekibimiz size hemen yardımcı olabilir. Sorunuzu ekibimize iletmemi ister misiniz? Lütfen **e-posta adresinizi** yazın.",
        ticket_required: true
      });
    }

    res.json({
      role: 'assistant',
      content: reply
    });
  } catch (error: any) {
    // [C-05 FIX] Log only message, not full error object (may contain API keys in response headers)
    console.error('[Chat] Error:', error?.message || 'Unknown error');
    next(error);
  }
};

export const createTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, question } = req.body;
    if (!email || !question) {
      throw new AppError('Email and question are required', 400, 'BAD_REQUEST');
    }

    // Basic email validation (RFC-ish)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
    }

    // Limit question length
    if (typeof question !== 'string' || question.length > 5000) {
      throw new AppError('Question must be a string under 5000 characters', 400, 'QUESTION_TOO_LONG');
    }

    const db = getDb();
    const ticketId = crypto.randomUUID();
    
    await db.run(
      'INSERT INTO tickets (id, email, question, status, created_at) VALUES (?, ?, ?, ?, ?)',
      ticketId,
      email,
      question,
      'open',
      new Date().toISOString()
    );

    res.json({ status: 'ok', ticket_id: ticketId });
  } catch (error) {
    next(error);
  }
};
