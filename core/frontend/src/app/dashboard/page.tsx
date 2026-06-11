'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { apiUrl } from '@/lib/api';
import { type AuthSession, clearStoredApiKey, clearStoredSession, decodeTokenSubject, getStoredApiKey, getStoredToken, setStoredApiKey } from '@/lib/auth';
import DailyUsageChart from '@/components/DailyUsageChart';
import WebhookManagement from '@/components/WebhookManagement';
import AlertSettings from '@/components/AlertSettings';
import ApiKeyManager from '@/components/ApiKeyManager';
import PlanPurchase from '@/components/PlanPurchase';
import UsageForecast from '@/components/UsageForecast';

function UsageSection({ apiKey, apiBase, refreshTrigger }: { apiKey: string; apiBase: string; refreshTrigger: number }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    const headers = { 'X-Api-Key': apiKey };
    Promise.all([
      fetch(`${apiBase}/v1/balance`, { headers }).then(r => r.json()),
      fetch(`${apiBase}/v1/usage/summary?since_hours=168`, { headers }).then(r => r.json()),
    ])
      .then(([bal, sum]) => {
        if (bal.ok) setBalance(bal.credits);
        if (sum.ok) setSummary(sum.summary);
        setLoading(false);
      })
      .catch(() => {
        setUsageError('Could not load usage data. A valid API key with credits may be required.');
        setLoading(false);
      });
  }, [apiKey, apiBase, refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10">
        <h2 className="text-3xl font-extrabold mb-4">Usage & Spending</h2>
        <div className="flex items-center gap-3 text-gray-500 font-bold">
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading usage data...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000] mb-10">
      <h2 className="text-3xl font-extrabold mb-4">Usage & Spending</h2>
      <p className="text-gray-700 font-medium mb-6 text-lg leading-relaxed">
        Track your credit balance, spending rate, and usage trends.
      </p>

      {usageError ? (
        <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-2xl text-yellow-800 font-semibold">
          {usageError}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-6">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Balance</p>
            <p className="text-4xl font-extrabold">{balance != null ? String(balance) : '\u2014'}</p>
            <p className="text-sm text-gray-500 font-semibold mt-1">credits remaining</p>
          </div>
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-6">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Verifications (7d)</p>
            <p className="text-4xl font-extrabold">{summary?.verify_events != null ? String(summary.verify_events) : '\u2014'}</p>
            <p className="text-sm text-gray-500 font-semibold mt-1">verified API calls</p>
          </div>
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-6">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Credits Spent (7d)</p>
            <p className="text-4xl font-extrabold">{summary?.credits_out != null ? String(summary.credits_out) : '\u2014'}</p>
            <p className="text-sm text-gray-500 font-semibold mt-1">credits consumed</p>
          </div>
          <div className="bg-gray-50 border-2 border-black rounded-2xl p-6">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Credits Added (7d)</p>
            <p className="text-4xl font-extrabold">{summary?.credits_in != null ? String(summary.credits_in) : '\u2014'}</p>
            <p className="text-sm text-gray-500 font-semibold mt-1">from top-ups</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const apiBase = apiUrl('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  const [keyRevoked, setKeyRevoked] = useState(false);

  const handleCreditsUpdated = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredSession();
    setSession(null);
    setToken(null);
    setApiKey(null);
    router.replace('/login');
  }, [router]);

  const validateStoredApiKey = useCallback(async (candidate: string) => {
    try {
      const response = await fetch(`${apiBase}/v1/client`, {
        headers: { 'X-Api-Key': candidate },
      });
      const data = await response.json().catch(() => null);
      return response.ok && data?.ok === true;
    } catch {
      return false;
    }
  }, [apiBase]);

  const hydrateSession = useCallback(async () => {
    const savedToken = getStoredToken();
    if (!savedToken) {
      router.replace('/login');
      return;
    }

    setToken(savedToken);
    setSessionLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/v1/auth/session'), {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AuthSession = await response.json();
      setSession(data);

      const savedApiKey = getStoredApiKey();
      if (savedApiKey) {
        const isValid = await validateStoredApiKey(savedApiKey);
        if (isValid) {
          setApiKey(savedApiKey);
        } else {
          clearStoredApiKey();
          setApiKey(null);
          setError('The API key stored in this browser is no longer valid. Please generate a new key.');
        }
      }
    } catch {
      setError('Could not validate the session. Check the API route and confirm the backend is running.');
    } finally {
      setSessionLoading(false);
    }
  }, [handleLogout, router, validateStoredApiKey]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  const handleGenerateKey = async () => {
    if (!token) {
      handleLogout();
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    setProvisioningStatus('Provisioning API key...');
    
    try {
      const response = await fetch(apiUrl('/v1/auth/provision'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setApiKey(data.api_key);
        setStoredApiKey(data.api_key);
        setKeyRevoked(!data.is_new_account);
        setSession((prev) => prev ? {
          ...prev,
          account: {
            ...prev.account,
            exists: true,
            client_id: data.client_id ?? prev.account.client_id,
          },
        } : prev);
        setRefreshTrigger(prev => prev + 1);
        setNotice(
          data.is_new_account
            ? `Your account has been created. ${data.free_credits_granted ?? 0} trial credits were added and your API key was saved on this device.`
            : 'A new API key was generated. The old key has been revoked and this device was updated.',
        );
        setProvisioningStatus(null);
      } else {
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.detail || errData?.error || `HTTP ${response.status}`;
        setError(`Could not provision API key: ${errMsg}`);
        setProvisioningStatus(null);
      }
    } catch {
      setError('Network error. Check the frontend-to-backend API route.');
      setProvisioningStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const pubkey = decodeTokenSubject(token);

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-aipp-bg text-black font-sans selection:bg-black selection:text-[#c8f53c] flex flex-col">
        <Navbar />
        <main className="flex-grow max-w-5xl mx-auto w-full px-6 py-12">
          <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000]">
            <h1 className="text-4xl font-extrabold mb-4">Preparing dashboard</h1>
            <div className="flex items-center gap-3 text-gray-500 font-bold">
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              Validating session and API key...
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-aipp-bg text-black font-sans selection:bg-black selection:text-[#c8f53c] flex flex-col">
      <Navbar />
      
      <main className="flex-grow max-w-5xl mx-auto w-full px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-white border-2 border-black px-6 py-3 rounded-full shadow-[4px_4px_0px_#000] flex items-center gap-3">
              <span className="font-bold">Wallet:</span>
              <span className="font-mono font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg border border-black/10">
                {pubkey.substring(0, 16)}...
              </span>
            </div>
            {session?.account.exists && (
              <div className="bg-white border-2 border-black px-4 py-3 rounded-full shadow-[2px_2px_0px_#000] text-sm font-bold">
                Customer account active
              </div>
            )}
            <button
              onClick={handleLogout}
              className="bg-white text-black font-bold px-5 py-3 rounded-full border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-black hover:text-[#c8f53c] transition-all active:translate-y-1 active:translate-x-1 active:shadow-none text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-400 p-4 rounded-2xl mb-6 text-red-800 font-semibold">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-green-50 border-2 border-green-400 p-4 rounded-2xl mb-6 text-green-800 font-semibold">
            {notice}
          </div>
        )}
        
        <div className="bg-white border-2 border-black p-8 md:p-10 rounded-3xl shadow-[8px_8px_0px_#000] mb-10 transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_#000]">
          <h2 className="text-3xl font-extrabold mb-4">Customer access and API key</h2>
          <p className="text-gray-700 font-medium mb-8 text-lg leading-relaxed max-w-3xl">
            You are signed in with LNURL. Your API key allows AI agents to access services with Lightning-based billing. Generated keys are stored locally on this device and cleared on logout.
          </p>
          
          {apiKey ? (
            <div className="space-y-6">
              {keyRevoked && (
                <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-2xl text-yellow-800 font-semibold">
                  Your previous API key has been revoked. Use the new key below.
                </div>
              )}
              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-black flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-[#c8f53c] border-r-2 border-black"></div>
                <code className="text-xl font-mono font-bold text-black ml-4 break-all">{apiKey}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(apiKey)}
                  className="bg-black text-[#c8f53c] font-bold px-6 py-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-[#1a1a1a] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all whitespace-nowrap"
                >
                  Copy key
                </button>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <p className="text-sm text-gray-500 font-semibold flex-1">
                  Your key is stored on this device. If you generate a new key, the old one will be revoked.
                </p>
                <button
                  onClick={handleGenerateKey}
                  disabled={loading}
                  className="bg-white text-black font-bold px-5 py-3 rounded-full border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-black hover:text-[#c8f53c] transition-all active:translate-y-1 active:translate-x-1 active:shadow-none text-sm disabled:opacity-50"
                >
                  {loading ? 'Refreshing...' : 'Generate new key'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <div className="bg-gray-50 border-2 border-black rounded-2xl p-5 w-full max-w-3xl">
                <p className="font-bold mb-2">
                  {session?.account.exists
                    ? 'There is already a customer account linked to this wallet.'
                    : 'This is your first login. A customer account and your first API key will be created in the next step.'}
                </p>
                <p className="text-sm text-gray-600 font-medium">
                  {session?.account.exists
                    ? 'If the key is not stored in this browser, you need to generate a new one. Generating a new key revokes the old one.'
                    : 'Trial credits will be added automatically when your first key is created.'}
                </p>
              </div>
              <button 
                onClick={handleGenerateKey}
                disabled={loading}
                className="bg-black text-[#c8f53c] text-xl font-extrabold px-8 py-5 rounded-full border-2 border-black shadow-[4px_4px_0px_#000] hover:bg-[#1a1a1a] hover:shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-6 w-6 text-[#c8f53c]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Provisioning...
                  </>
                ) : session?.account.exists ? 'Generate new API key' : 'Create account and issue API key'}
              </button>
              {provisioningStatus && (
                <div className="text-black font-bold mt-4 animate-pulse flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-black animate-ping"></span>
                  {provisioningStatus}
                </div>
              )}
            </div>
          )}
        </div>

        {apiKey && <ApiKeyManager apiKey={apiKey} apiBase={apiBase} key={refreshTrigger} />}
        {apiKey && <UsageSection apiKey={apiKey} apiBase={apiBase} refreshTrigger={refreshTrigger} />}
        {apiKey && <PlanPurchase apiKey={apiKey} apiBase={apiBase} onCreditsUpdated={handleCreditsUpdated} />}
        {apiKey && <UsageForecast apiKey={apiKey} apiBase={apiBase} refreshTrigger={refreshTrigger} />}
        {apiKey && <DailyUsageChart apiKey={apiKey} apiBase={apiBase} key={refreshTrigger} />}
        {apiKey && <WebhookManagement apiKey={apiKey} apiBase={apiBase} />}
        {apiKey && <AlertSettings apiKey={apiKey} apiBase={apiBase} />}
      </main>
    </div>
  );
}
