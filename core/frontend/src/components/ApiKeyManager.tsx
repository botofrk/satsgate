'use client';

import { useState, useEffect, useCallback } from 'react';

interface ClientInfo {
  client_id: number;
  credits: number;
  payee_lightning_address: string | null;
}

interface LedgerEntry {
  id: number;
  delta_credits: number;
  reason: string;
  ref: string | null;
  created_at: number;
}

export default function ApiKeyManager({ apiKey, apiBase }: { apiKey: string; apiBase: string }) {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    if (!apiKey) return;
    try {
      const [infoRes, ledgerRes] = await Promise.all([
        fetch(`${apiBase}/v1/client`, { headers: { 'X-Api-Key': apiKey } }),
        fetch(`${apiBase}/v1/ledger?limit=20`, { headers: { 'X-Api-Key': apiKey } }),
      ]);
      const info = await infoRes.json();
      const led = await ledgerRes.json();
      if (info.ok) setClientInfo(info);
      if (led.ok) setLedger(led.entries || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10">
        <h2 className="text-3xl font-extrabold mb-4">API Key Details</h2>
        <div className="flex items-center gap-3 text-gray-500 font-bold">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <h2 className="text-3xl font-extrabold mb-2">API Key Details</h2>
      <p className="text-gray-700 font-medium mb-6 text-lg">
        Your key, client info, and recent activity.
      </p>

      {/* API Key Display */}
      <div className="bg-gray-50 border-2 border-black rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">API Key</p>
            <code className="text-sm font-mono font-bold break-all">{apiKey}</code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(apiKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="bg-black text-[#c8f53c] font-bold px-4 py-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none text-sm whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Client Info */}
      {clientInfo && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-5">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Client ID</p>
            <p className="text-2xl font-extrabold font-mono">#{clientInfo.client_id}</p>
          </div>
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-5">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Balance</p>
            <p className="text-2xl font-extrabold">{clientInfo.credits}</p>
            <p className="text-xs text-gray-500 font-semibold">credits</p>
          </div>
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-5">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Payee</p>
            <p className="text-sm font-mono font-bold truncate">
              {clientInfo.payee_lightning_address || 'Not set'}
            </p>
          </div>
        </div>
      )}

      {/* Recent Ledger */}
      <div>
        <h3 className="text-xl font-extrabold mb-4">Recent Activity</h3>
        {ledger.length === 0 ? (
          <p className="text-gray-500 font-semibold">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((entry) => (
              <div
                key={entry.id}
                className="bg-gray-50 border-2 border-black rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold text-sm px-2 py-0.5 rounded-lg ${
                        entry.delta_credits > 0
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {entry.delta_credits > 0 ? '+' : ''}{entry.delta_credits}
                    </span>
                    <span className="text-sm font-bold">{entry.reason}</span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-1">{formatTime(entry.created_at)}</p>
                </div>
                {entry.ref && (
                  <span className="text-xs font-mono text-gray-400 truncate max-w-[120px]">{entry.ref}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
