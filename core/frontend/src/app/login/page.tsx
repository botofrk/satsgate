"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "@/components/Navbar";
import { apiUrl } from "@/lib/api";
import { getStoredToken, setStoredToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [lnurl, setLnurl] = useState<string>("");
  const [k1, setK1] = useState<string>("");
  const [status, setStatus] = useState<string>("Cüzdan bağlantısı hazırlanıyor...");
  const [error, setError] = useState<string | null>(null);

  const generateLnurl = () => {
    setError(null);
    setStatus("Cüzdan bağlantısı hazırlanıyor...");
    fetch(apiUrl("/v1/auth/lnurl/generate"))
      .then((res) => res.json())
      .then((data) => {
        setLnurl(data.lnurl);
        setK1(data.k1);
        setStatus("QR kodunu cüzdanınızla tarayın");
      })
      .catch(() => {
        setError("LNURL oturumu oluşturulamadı. Backend bağlantısını kontrol edin.");
        setStatus("Bağlantı kurulamadı");
      });
  };

  useEffect(() => {
    const existingToken = getStoredToken();
    if (existingToken) {
      router.push("/dashboard");
      return;
    }
    generateLnurl();
  }, [router]);

  useEffect(() => {
    if (!k1) return;

    const interval = setInterval(() => {
      fetch(apiUrl(`/v1/auth/lnurl/status?k1=${k1}`))
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "authenticated") {
            clearInterval(interval);
            setStatus("Giriş başarılı. Panele yönlendiriliyorsunuz...");
            setStoredToken(data.token);
            setTimeout(() => {
              router.push("/dashboard");
            }, 1000);
          }
        })
        .catch(() => setError("Giriş durumu kontrol edilirken bağlantı hatası oluştu."));
    }, 2000);

    return () => clearInterval(interval);
  }, [k1, router]);

  return (
    <div className="min-h-screen bg-aipp-bg text-black font-sans selection:bg-black selection:text-[#c8f53c] flex flex-col">
      <Navbar />
      
      <main className="flex-grow flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-white border-2 border-black p-8 rounded-3xl shadow-[6px_6px_0px_#000] flex flex-col items-center text-center hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[10px_10px_0px_#000] transition-all">
          <h1 className="text-4xl font-extrabold mb-4 font-logo tracking-wide">
            Giriş
          </h1>
          <p className="text-gray-700 font-medium mb-2">
            Lightning cüzdanınızla QR kodu tarayarak güvenli giriş yapın.
          </p>
          <p className="text-xs text-gray-500 font-semibold mb-6">
            ⚡ Desteklenen cüzdanlar: Zeus, Alby, Blixt, Phoenix
          </p>

          {lnurl ? (
            <div className="bg-white border-2 border-black p-4 rounded-2xl mb-6 shadow-[4px_4px_0px_#000]">
              <QRCodeSVG value={lnurl} size={256} />
            </div>
          ) : (
            <div className="w-64 h-64 border-4 border-dashed border-black rounded-2xl mb-6 flex items-center justify-center bg-gray-50">
              <span className="text-black font-bold animate-pulse">Hazırlanıyor...</span>
            </div>
          )}

          <div className="text-lg font-extrabold text-black mb-6 animate-pulse">
            {status}
          </div>

          {error && (
            <div className="w-full bg-red-50 border-2 border-red-400 rounded-2xl p-4 mb-4 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={generateLnurl}
            className="w-full py-4 px-4 rounded-xl border-2 border-black text-black font-bold text-sm hover:bg-black hover:text-[#c8f53c] transition-colors shadow-[2px_2px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none"
          >
            Yeni giriş isteği oluştur
          </button>
        </div>
      </main>
    </div>
  );
}
