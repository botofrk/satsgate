'use client';

import { useState, useEffect, useCallback } from 'react';

export default function AlertSettings({ apiKey, apiBase }: { apiKey: string; apiBase: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lowThreshold, setLowThreshold] = useState('');
  const [criticalThreshold, setCriticalThreshold] = useState('');
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(false);
  const [autoTopupThreshold, setAutoTopupThreshold] = useState('');
  const [autoTopupPlan, setAutoTopupPlan] = useState('trial');
  const [autoTopupMax, setAutoTopupMax] = useState('');
  const [usageAlertEnabled, setUsageAlertEnabled] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  const fetchConfig = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${apiBase}/v1/alerts`, { headers: { 'X-Api-Key': apiKey } });
      const data = await res.json();
      if (data.ok && data.config) {
        const c = data.config;
        setLowThreshold(c.balance_threshold_low != null ? String(c.balance_threshold_low) : '');
        setCriticalThreshold(c.balance_threshold_critical != null ? String(c.balance_threshold_critical) : '');
        setAutoTopupEnabled(c.auto_topup_enabled || false);
        setAutoTopupThreshold(c.auto_topup_threshold != null ? String(c.auto_topup_threshold) : '');
        setAutoTopupPlan(c.auto_topup_plan_id || 'trial');
        setAutoTopupMax(c.auto_topup_max_sats != null ? String(c.auto_topup_max_sats) : '');
        setUsageAlertEnabled(c.usage_alert_enabled || false);
        setDailyLimit(c.usage_alert_daily_limit != null ? String(c.usage_alert_daily_limit) : '');
        setWebhookUrl(c.notify_webhook_url || '');
      }
    } catch { /* endpoint may not exist yet */ }
    finally { setLoading(false); }
  }, [apiKey, apiBase]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setError(null); setSuccess(null); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        balance_threshold_low: lowThreshold ? parseInt(lowThreshold) : null,
        balance_threshold_critical: criticalThreshold ? parseInt(criticalThreshold) : null,
        auto_topup_enabled: autoTopupEnabled,
        auto_topup_threshold: autoTopupThreshold ? parseInt(autoTopupThreshold) : null,
        auto_topup_plan_id: autoTopupPlan || null,
        auto_topup_max_sats: autoTopupMax ? parseInt(autoTopupMax) : null,
        usage_alert_enabled: usageAlertEnabled,
        usage_alert_daily_limit: dailyLimit ? parseInt(dailyLimit) : null,
        notify_webhook_url: webhookUrl || null,
      };
      const res = await fetch(`${apiBase}/v1/alerts`, {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) { setSuccess('Alert settings saved!'); fetchConfig(); }
      else { setError(data.error || 'Failed to save'); }
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10">
        <h2 className="text-3xl font-extrabold mb-4">Alerts &amp; Auto-Topup</h2>
        <div className="flex items-center gap-3 text-gray-500 font-bold">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <h2 className="text-3xl font-extrabold mb-2">Alerts &amp; Auto-Topup</h2>
      <p className="text-gray-700 font-medium mb-8 text-lg leading-relaxed">
        Get notified when credits run low. Optionally auto-replenish to avoid downtime.
      </p>

      {error && <div className="bg-red-50 border-2 border-red-400 p-3 rounded-xl mb-4 text-red-800 font-semibold text-sm">{error}</div>}
      {success && <div className="bg-green-50 border-2 border-green-400 p-3 rounded-xl mb-4 text-green-800 font-semibold text-sm">{success}</div>}

      {/* Balance Alerts */}
      <div className="mb-8">
        <h3 className="text-xl font-extrabold mb-4">Balance Alerts</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">Low Balance Threshold</label>
            <input type="number" value={lowThreshold} onChange={(e) => setLowThreshold(e.target.value)} placeholder="e.g. 100" className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
            <p className="text-xs text-gray-500 mt-1">Alert when credits drop below this</p>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Critical Threshold</label>
            <input type="number" value={criticalThreshold} onChange={(e) => setCriticalThreshold(e.target.value)} placeholder="e.g. 10" className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
            <p className="text-xs text-gray-500 mt-1">Critical alert when credits drop below this</p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-bold mb-1">Notification Webhook URL</label>
          <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-app.com/alert-webhook" className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
        </div>
      </div>

      {/* Auto-Topup */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-xl font-extrabold">Auto-Topup</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={autoTopupEnabled} onChange={(e) => setAutoTopupEnabled(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c8f53c] peer-checked:border-black border-2 border-black" />
          </label>
        </div>
        {autoTopupEnabled && (
          <div className="grid md:grid-cols-3 gap-4 bg-gray-50 border-2 border-black rounded-2xl p-5">
            <div>
              <label className="block text-sm font-bold mb-1">Trigger Below</label>
              <input type="number" value={autoTopupThreshold} onChange={(e) => setAutoTopupThreshold(e.target.value)} placeholder="credits" className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Plan</label>
              <select value={autoTopupPlan} onChange={(e) => setAutoTopupPlan(e.target.value)} className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c] bg-white">
                <option value="trial">Trial (1K sats / 200 credits)</option>
                <option value="value">Value (25K sats / 10K credits)</option>
                <option value="pro">Pro (250K sats / 150K credits)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Max Sats/Cycle</label>
              <input type="number" value={autoTopupMax} onChange={(e) => setAutoTopupMax(e.target.value)} placeholder="safety cap" className="w-full border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
            </div>
          </div>
        )}
      </div>

      {/* Usage Alerts */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-xl font-extrabold">Usage Alerts</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={usageAlertEnabled} onChange={(e) => setUsageAlertEnabled(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c8f53c] peer-checked:border-black border-2 border-black" />
          </label>
        </div>
        {usageAlertEnabled && (
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-5">
            <label className="block text-sm font-bold mb-1">Daily Usage Limit Alert</label>
            <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="credits per day" className="w-full max-w-sm border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]" />
            <p className="text-xs text-gray-500 mt-1">Alert when daily usage exceeds this limit</p>
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-black text-[#c8f53c] font-bold px-8 py-4 rounded-full border-2 border-black shadow-[4px_4px_0px_#000] hover:bg-[#1a1a1a] hover:shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 text-lg">
        {saving ? 'Saving...' : 'Save Alert Settings'}
      </button>
    </div>
  );
}
