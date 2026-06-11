'use client';

import { useState, useEffect, useCallback } from 'react';

interface Webhook {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

const AVAILABLE_EVENTS = [
  'payment.received',
  'payment.failed',
  'balance.low',
  'balance.zero',
  'topup.completed',
  'topup.failed',
  'client.created',
  'client.provisioned',
];

export default function WebhookManagement({ apiKey, apiBase }: { apiKey: string; apiBase: string }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>(['payment.received']);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${apiBase}/v1/webhooks`, {
        headers: { 'X-Api-Key': apiKey },
      });
      const data = await res.json();
      if (data.ok) setWebhooks(data.webhooks || []);
    } catch {
      // Webhooks endpoint may not exist yet
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBase]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const handleCreate = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiBase}/v1/webhooks`, {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, events: newEvents }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess('Webhook created! Secret: ' + data.secret + ' — Save it, shown only once.');
        setNewUrl('');
        setNewEvents(['payment.received']);
        setShowForm(false);
        fetchWebhooks();
      } else {
        setError(data.error || 'Failed to create webhook');
      }
    } catch {
      setError('Network error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${apiBase}/v1/webhooks/${id}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': apiKey },
      });
      fetchWebhooks();
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-extrabold">Webhooks</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-black text-[#c8f53c] font-bold px-5 py-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none text-sm"
        >
          {showForm ? 'Cancel' : '+ Add Webhook'}
        </button>
      </div>
      <p className="text-gray-700 font-medium mb-6 text-lg">
        Receive HTTP callbacks when events happen (payments, balance alerts, etc).
      </p>

      {error && <div className="bg-red-50 border-2 border-red-400 p-3 rounded-xl mb-4 text-red-800 font-semibold text-sm">{error}</div>}
      {success && <div className="bg-green-50 border-2 border-green-400 p-3 rounded-xl mb-4 text-green-800 font-semibold text-sm break-all">{success}</div>}

      {showForm && (
        <div className="bg-gray-50 border-2 border-black rounded-2xl p-6 mb-6">
          <label className="block text-sm font-bold mb-2">Webhook URL</label>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://your-app.com/webhook"
            className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#c8f53c]"
          />
          <label className="block text-sm font-bold mb-2">Events</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {AVAILABLE_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEvents.includes(event)}
                  onChange={(e) => {
                    if (e.target.checked) setNewEvents([...newEvents, event]);
                    else setNewEvents(newEvents.filter((x) => x !== event));
                  }}
                  className="accent-[#c8f53c]"
                />
                {event}
              </label>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newUrl || newEvents.length === 0}
            className="bg-black text-[#c8f53c] font-bold px-6 py-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none disabled:opacity-50"
          >
            Create Webhook
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 font-bold">Loading webhooks...</div>
      ) : webhooks.length === 0 ? (
        <p className="text-gray-500 font-semibold">No webhooks configured yet.</p>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <div key={wh.id} className="bg-gray-50 border-2 border-black rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <code className="text-sm font-mono font-bold break-all">{wh.url}</code>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {wh.events.map((ev) => (
                    <span key={ev} className="bg-black text-[#c8f53c] text-xs font-mono font-bold px-2 py-0.5 rounded-lg">{ev}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleDelete(wh.id)}
                className="bg-red-100 text-red-700 font-bold px-4 py-2 rounded-xl border-2 border-red-300 text-sm hover:bg-red-200 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
