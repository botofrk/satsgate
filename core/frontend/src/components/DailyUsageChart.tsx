'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DailyEntry {
  day: string;
  verifications: number;
  credits_spent: number;
  credits_added: number;
}

export default function DailyUsageChart({ apiKey, apiBase }: { apiKey: string; apiBase: string }) {
  const [data, setData] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) return;
    fetch(`${apiBase}/v1/usage/daily?days=30`, {
      headers: { 'X-Api-Key': apiKey },
    })
      .then((r) => r.json())
      .then((d) => {
        const rawSeries = Array.isArray(d?.daily)
          ? d.daily
          : Array.isArray(d?.series)
            ? d.series
            : Array.isArray(d?.daily_report?.series)
              ? d.daily_report.series
              : [];

        if (d.ok && rawSeries.length > 0) {
          const chartData = rawSeries.map((item: Record<string, unknown>) => ({
            day: String(item.day || '').slice(5),
            verifications: Number(item.verifications ?? item.verify_events ?? 0),
            credits_spent: Number(item.credits_spent ?? item.credits_out ?? 0),
            credits_added: Number(item.credits_added ?? item.credits_in ?? 0),
          }));
          setData(chartData);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiKey, apiBase]);

  if (loading) {
    return (
      <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10">
        <h2 className="text-3xl font-extrabold mb-4">Daily Usage (30 Days)</h2>
        <div className="flex items-center gap-3 text-gray-500 font-bold">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading chart...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
      <h2 className="text-3xl font-extrabold mb-2">Daily Usage (30 Days)</h2>
      <p className="text-gray-700 font-medium mb-6 text-lg leading-relaxed">
        Credit consumption and top-ups over the last 30 days.
      </p>
      <div className="bg-gray-50 border-2 border-black rounded-2xl p-4">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
            <YAxis tick={{ fontSize: 11, fontFamily: 'monospace' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '2px solid #000',
                borderRadius: '12px',
                fontFamily: 'monospace',
                fontSize: '13px',
              }}
            />
            <Bar dataKey="credits_spent" name="Credits Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="credits_added" name="Credits Added" fill="#c8f53c" radius={[4, 4, 0, 0]} />
            <Bar dataKey="verifications" name="Verifications" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-red-500 border border-black" />
          <span className="text-sm font-bold">Credits Spent</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-[#c8f53c] border border-black" />
          <span className="text-sm font-bold">Credits Added</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-blue-500 border border-black" />
          <span className="text-sm font-bold">Verifications</span>
        </div>
      </div>
    </div>
  );
}
