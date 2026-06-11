'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Plan {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  note?: string;
  price_sats: number;
  credits: number;
}

interface TopupChallenge {
  macaroon: string;
  invoice: string;
  payment_hash: string;
  plan: Plan;
}

export default function PlanPurchase({ apiKey, apiBase, onCreditsUpdated }: { apiKey: string; apiBase: string; onCreditsUpdated?: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTopup, setActiveTopup] = useState<TopupChallenge | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [preimage, setPreimage] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/v1/plans`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPlans(d.plans); })
      .catch(() => setError('Failed to load plans'))
      .finally(() => setLoading(false));
  }, [apiBase]);

  const getPlanName = (plan: Plan) => plan.name || plan.title || plan.id;
  const getPlanDescription = (plan: Plan) => plan.description || plan.note || '';

  const handleBuy = async (planId: string) => {
    setError(null);
    setSuccess(null);
    setPreimage(null);
    setActiveTopup(null);
    setPurchasing(true);

    try {
      const res = await fetch(`${apiBase}/v1/topup/${planId}`, {
        headers: apiKey ? { 'X-Api-Key': apiKey } : {},
      });
      if (res.status === 402) {
        const data = await res.json();
        setActiveTopup({
          macaroon: data.macaroon,
          invoice: data.invoice,
          payment_hash: data.payment_hash,
          plan: data.plan,
        });
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Unexpected response: ${res.status}`);
      }
    } catch {
      setError('Network error');
    } finally {
      setPurchasing(false);
    }
  };

  const handleMockPay = async () => {
    if (!activeTopup) return;
    try {
      const res = await fetch(`${apiBase}/dev/mock/pay/${activeTopup.payment_hash}`);
      const data = await res.json();
      if (data.ok) {
        setPreimage(data.preimage);
      } else {
        setError(data.error || 'Mock pay failed');
      }
    } catch {
      setError('Mock pay network error');
    }
  };

  const handleFinalize = async () => {
    if (!activeTopup || !preimage) return;
    setFinalizing(true);
    setError(null);
    try {
      const auth = `L402 ${activeTopup.macaroon}:${preimage}`;
      const res = await fetch(`${apiBase}/v1/topup/${activeTopup.plan.id}`, {
        headers: { 'Authorization': auth, ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`🎉 ${data.credits_added} credits added! New balance: ${data.new_balance}`);
        if (data.api_key) {
          setSuccess(prev => (prev || '') + `\nAPI Key: ${data.api_key} (save it!)`);
        }
        setActiveTopup(null);
        setPreimage(null);
        onCreditsUpdated?.();
      } else {
        setError(data.error || 'Finalize failed');
      }
    } catch {
      setError('Finalize network error');
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancel = () => {
    setActiveTopup(null);
    setPreimage(null);
    setError(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10">
        <h2 className="text-3xl font-extrabold mb-4">Buy Credits</h2>
        <div className="flex items-center gap-3 text-gray-500 font-bold">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading plans...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <h2 className="text-3xl font-extrabold mb-2">Buy Credits</h2>
      <p className="text-gray-700 font-medium mb-8 text-lg leading-relaxed">
        Purchase credits via Lightning Network. No credit card needed.
      </p>

      {error && <div className="bg-red-50 border-2 border-red-400 p-4 rounded-2xl mb-6 text-red-800 font-semibold">{error}</div>}
      {success && <div className="bg-green-50 border-2 border-green-400 p-4 rounded-2xl mb-6 text-green-800 font-semibold whitespace-pre-line">{success}</div>}

      {/* Active Topup Flow */}
      {activeTopup && (
        <div className="bg-gray-50 border-2 border-black rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-extrabold mb-4">Complete Purchase — {getPlanName(activeTopup.plan)}</h3>
          <p className="text-gray-700 font-semibold mb-4">{activeTopup.plan.price_sats.toLocaleString()} sats for {activeTopup.plan.credits.toLocaleString()} credits</p>

          {/* QR Code */}
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-xl border-2 border-black">
              <QRCodeSVG value={activeTopup.invoice} size={200} />
            </div>
          </div>

          {/* Invoice */}
          <div className="mb-4">
            <label className="block text-sm font-bold mb-1">Lightning Invoice</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={activeTopup.invoice}
                className="flex-1 border-2 border-black rounded-xl px-4 py-3 font-mono text-xs bg-white focus:outline-none"
              />
              <button
                onClick={() => copyToClipboard(activeTopup.invoice)}
                className="bg-black text-[#c8f53c] font-bold px-4 py-2 rounded-xl border-2 border-black text-sm hover:bg-[#1a1a1a] active:translate-y-0.5 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Pay this invoice with your Lightning wallet, then enter the preimage below.</p>
          </div>

          {/* Preimage input or Mock Pay */}
          <div className="mb-6">
            <label className="block text-sm font-bold mb-1">Preimage (proof of payment)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={preimage || ''}
                onChange={(e) => setPreimage(e.target.value)}
                placeholder="Hex preimage from your wallet..."
                className="flex-1 border-2 border-black rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#c8f53c]"
              />
              <button
                onClick={handleMockPay}
                className="bg-yellow-100 text-yellow-800 font-bold px-4 py-2 rounded-xl border-2 border-yellow-400 text-sm hover:bg-yellow-200 whitespace-nowrap"
                title="Dev only: simulate payment"
              >
                ⚡ Mock Pay
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleFinalize}
              disabled={!preimage || finalizing}
              className="bg-black text-[#c8f53c] font-bold px-8 py-3 rounded-full border-2 border-black shadow-[3px_3px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {finalizing ? 'Finalizing...' : 'Complete Purchase'}
            </button>
            <button
              onClick={handleCancel}
              className="bg-white text-black font-bold px-6 py-3 rounded-full border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-gray-100 active:translate-y-0.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan, i) => (
          <div
            key={plan.id}
            className={`bg-gray-50 border-2 border-black rounded-2xl p-6 flex flex-col transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_#000] ${i === 1 ? 'ring-2 ring-[#c8f53c]' : 'shadow-[4px_4px_0px_#000]'}`}
          >
            {i === 1 && (
              <div className="bg-[#c8f53c] text-black text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border-2 border-black self-start mb-3">
                Best Value
              </div>
            )}
            <h3 className="text-2xl font-extrabold mb-1">{getPlanName(plan)}</h3>
            <p className="text-gray-500 font-semibold text-sm mb-4">{getPlanDescription(plan)}</p>
            <div className="flex-1 space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Price</span>
                <span className="font-extrabold text-lg">{plan.price_sats.toLocaleString()} sats</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Credits</span>
                <span className="font-extrabold text-lg">{plan.credits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Cost per verify</span>
                <span className="font-mono font-bold text-sm bg-black text-[#c8f53c] px-2 py-0.5 rounded-lg">
                  {(plan.price_sats / plan.credits).toFixed(1)} sats
                </span>
              </div>
            </div>
            <button
              onClick={() => handleBuy(plan.id)}
              disabled={purchasing || !!activeTopup}
              className="w-full bg-black text-[#c8f53c] font-bold py-3 rounded-full border-2 border-black shadow-[3px_3px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {purchasing ? 'Loading...' : 'Buy Now'}
            </button>
          </div>
        ))}
      </div>

      {plans.length === 0 && !error && (
        <p className="text-gray-500 font-semibold text-center py-8">No plans available.</p>
      )}
    </div>
  );
}
