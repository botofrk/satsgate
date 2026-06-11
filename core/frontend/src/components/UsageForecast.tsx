'use client';

import { useState, useEffect, useCallback } from 'react';

interface ForecastRecommendation {
  rate_credits_per_day: number;
  target_balance_credits: number;
  additional_credits_needed: number;
  topup_now: boolean | null;
  should_topup_now: boolean | null;
  topup_in_days: number | null;
  credits_until_target: number | null;
  recommended_purchase: {
    plan_id: string;
    plan_name?: string;
    price_sats?: number;
    credits_total: number;
    qty?: number;
    quantity?: number;
    sats_total?: number;
    plan?: {
      name?: string;
      title?: string;
      price_sats?: number;
      credits?: number;
    };
  } | null;
  projected_balance_after_purchase: number;
  projected_days_remaining_after_purchase: number | null;
  reason: string;
}

export default function UsageForecast({ apiKey, apiBase, refreshTrigger }: { apiKey: string; apiBase: string; refreshTrigger?: number }) {
  const [forecast, setForecast] = useState<ForecastRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${apiBase}/v1/usage/forecast?lookback_hours=168&buffer_days=14&trigger_hours=48`, {
        headers: { 'X-Api-Key': apiKey },
      });
      const data = await res.json();
      if (data.ok) {
        setForecast(data.recommendation);
      }
    } catch {
      setError('Forecast unavailable');
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBase]);

  useEffect(() => { fetchForecast(); }, [fetchForecast, refreshTrigger]);

  if (loading) return null;
  if (error || !forecast) return null;

  // Don't show if there's no usage data
  if (forecast.rate_credits_per_day <= 0) return null;

  const getStatusColor = () => {
    if (forecast.topup_now) return 'text-red-600 bg-red-50 border-red-400';
    if (forecast.should_topup_now) return 'text-yellow-800 bg-yellow-50 border-yellow-400';
    return 'text-green-800 bg-green-50 border-green-400';
  };

  const getStatusText = () => {
    if (forecast.topup_now) return '⚠️ Credits running low — top up now!';
    if (forecast.should_topup_now) return '⚡ Credits getting low — consider topping up';
    if (forecast.projected_days_remaining_after_purchase && forecast.projected_days_remaining_after_purchase <= 30) {
      return `✅ ${Math.round(forecast.projected_days_remaining_after_purchase)} days of runway`;
    }
    return '✅ Healthy balance';
  };

  const recommendedQty = forecast.recommended_purchase?.qty ?? forecast.recommended_purchase?.quantity ?? 1;
  const recommendedName =
    forecast.recommended_purchase?.plan_name ||
    forecast.recommended_purchase?.plan?.name ||
    forecast.recommended_purchase?.plan?.title ||
    forecast.recommended_purchase?.plan_id;
  const recommendedSats =
    forecast.recommended_purchase?.price_sats ??
    forecast.recommended_purchase?.sats_total ??
    forecast.recommended_purchase?.plan?.price_sats ??
    0;

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <h2 className="text-3xl font-extrabold mb-2">Usage Forecast</h2>
      <p className="text-gray-700 font-medium mb-6 text-lg leading-relaxed">
        Projected credit runway and purchase recommendations.
      </p>

      {/* Status Banner */}
      <div className={`border-2 rounded-2xl p-4 mb-6 font-bold ${getStatusColor()}`}>
        {getStatusText()}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 border-2 border-black rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Daily Burn Rate</p>
          <p className="text-2xl font-extrabold">{forecast.rate_credits_per_day.toFixed(1)}</p>
          <p className="text-xs text-gray-500 font-semibold">credits/day</p>
        </div>
        <div className="bg-gray-50 border-2 border-black rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Target Buffer</p>
          <p className="text-2xl font-extrabold">{forecast.target_balance_credits.toLocaleString()}</p>
          <p className="text-xs text-gray-500 font-semibold">credits</p>
        </div>
        {forecast.credits_until_target != null && (
          <div className="bg-gray-50 border-2 border-black rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Surplus/Deficit</p>
            <p className={`text-2xl font-extrabold ${forecast.credits_until_target < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {forecast.credits_until_target > 0 ? '+' : ''}{forecast.credits_until_target}
            </p>
            <p className="text-xs text-gray-500 font-semibold">vs. target</p>
          </div>
        )}
        {forecast.topup_in_days != null && (
          <div className="bg-gray-50 border-2 border-black rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Days Until Topup</p>
            <p className="text-2xl font-extrabold">{forecast.topup_in_days.toFixed(1)}</p>
            <p className="text-xs text-gray-500 font-semibold">at current rate</p>
          </div>
        )}
      </div>

      {/* Recommended Purchase */}
      {forecast.recommended_purchase && (
        <div className="bg-gray-50 border-2 border-black rounded-2xl p-5">
          <h3 className="text-lg font-extrabold mb-3">Recommended Purchase</h3>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="font-extrabold text-xl">{recommendedName}</span>
              <span className="text-gray-500 mx-2">×</span>
              <span className="font-extrabold">{recommendedQty}</span>
              <div className="text-sm text-gray-600 font-semibold mt-1">
                {recommendedSats.toLocaleString()} sats for {forecast.recommended_purchase.credits_total.toLocaleString()} credits
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 font-semibold">After purchase:</p>
              <p className="font-extrabold text-lg">{forecast.projected_balance_after_purchase.toLocaleString()} credits</p>
              {forecast.projected_days_remaining_after_purchase != null && (
                <p className="text-sm text-gray-500 font-semibold">
                  ~{forecast.projected_days_remaining_after_purchase.toFixed(0)} days of runway
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
