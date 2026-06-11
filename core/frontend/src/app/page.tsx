import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col relative bg-[#c8f53c] text-black font-sans selection:bg-black selection:text-[#c8f53c]">
      <Navbar />
      
      <main className="flex-grow z-10 flex flex-col items-center w-full">
        <Hero />
        
        {/* Features Section */}
        <section className="max-w-7xl w-full mx-auto px-6 py-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_#000] transition-all">
            <div className="w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
            </div>
            <h3 className="text-xl font-extrabold mb-4">L402 Payment Protocol</h3>
            <p className="text-gray-700 font-medium leading-relaxed text-sm">
              HTTP 402 Payment Required + Lightning macaroons. Native pay-per-call for AI agents. No subscriptions, no signups.
            </p>
          </div>
          
          <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_#000] transition-all">
            <div className="w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <h3 className="text-xl font-extrabold mb-4">Global & Instant</h3>
            <p className="text-gray-700 font-medium leading-relaxed text-sm">
              Send and receive payments worldwide in milliseconds. Powered by the Lightning Network - no banks, no borders.
            </p>
          </div>

          <div className="bg-white border-2 border-black rounded-2xl p-8 shadow-[4px_4px_0px_#000] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[8px_8px_0px_#000] transition-all">
            <div className="w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <h3 className="text-xl font-extrabold mb-4">One API Key</h3>
            <p className="text-gray-700 font-medium leading-relaxed text-sm">
              One API Key to rule them all. Access hundreds of AI models across different providers with a single Lightning-backed balance.
            </p>
          </div>
        </section>

        {/* L402 Wallet Connect Section */}
        <section className="w-full py-20 flex flex-col items-center">
          <h2 className="text-4xl font-extrabold mb-4">L402 Wallet Connect</h2>
          <p className="text-[#1a1a1a] font-medium mb-10 text-center">AIPP L402 Protocol. One API Key. Every Network.</p>
          
          <div className="bg-white border-2 border-black rounded-[30px] p-2 flex flex-col max-w-xl w-full mx-6 shadow-[6px_6px_0px_#000]">
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black/5">
              <span className="font-mono text-sm font-semibold text-gray-800">https://api.aipp.dev/v1/paywall</span>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span className="font-mono text-sm tracking-widest text-black font-extrabold">............</span>
              </span>
            </div>
            <Link href="/login" className="w-full bg-black text-[#c8f53c] font-bold py-4 rounded-[22px] mt-2 flex justify-center items-center gap-2 hover:bg-[#1a1a1a] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4v16l13-8z"/></svg>
              Connect Wallet
            </Link>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="w-full max-w-4xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-8">
          <div className="bg-white border-2 border-black rounded-3xl p-10 shadow-[6px_6px_0px_#000] flex flex-col">
            <h3 className="text-4xl font-extrabold mb-8">Trial</h3>
            <ul className="flex flex-col gap-4 mb-10 flex-grow">
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 1,000 sats / 200 credits</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Wallet login + instant customer onboarding</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> No email, no card, no KYC</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Ideal for testing the full L402 flow</li>
            </ul>
            <Link href="/login" className="w-full text-center bg-white text-black border-2 border-black font-extrabold py-4 rounded-full hover:bg-black hover:text-[#c8f53c] transition-colors shadow-[2px_2px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none block">
              Start Trial
            </Link>
          </div>

          <div className="bg-white border-2 border-black rounded-3xl p-10 shadow-[6px_6px_0px_#000] flex flex-col">
            <h3 className="text-4xl font-extrabold mb-8">Value</h3>
            <ul className="flex flex-col gap-4 mb-10 flex-grow">
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> 25,000 sats / 10,000 credits</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Credits never expire</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Pay directly with Lightning</li>
              <li className="flex items-center gap-3 font-semibold text-gray-800"><svg className="text-black" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Best value for production usage</li>
            </ul>
            <Link href="/login" className="w-full text-center bg-black text-[#c8f53c] border-2 border-black font-extrabold py-4 rounded-full hover:bg-[#1a1a1a] transition-colors shadow-[2px_2px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none block">
              Buy Value Plan
            </Link>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full border-t-2 border-black/10 py-10 flex flex-col items-center gap-4 mt-10">
        <div className="flex gap-4">
          <Link href="/" className="bg-white border-2 border-black font-bold px-6 py-2 rounded-lg text-sm shadow-[2px_2px_0px_#000] hover:bg-black hover:text-[#c8f53c] transition-colors">Home</Link>
          <Link href="/docs" className="bg-white border-2 border-black font-bold px-6 py-2 rounded-lg text-sm shadow-[2px_2px_0px_#000] hover:bg-black hover:text-[#c8f53c] transition-colors">Docs</Link>
          <Link href="/login" className="bg-white border-2 border-black font-bold px-6 py-2 rounded-lg text-sm shadow-[2px_2px_0px_#000] hover:bg-black hover:text-[#c8f53c] transition-colors">Login</Link>
        </div>
        <p className="text-sm font-semibold text-gray-700 mt-2">© {new Date().getFullYear()} AIPP API · All Rights Reserved · Powered by Lightning Network</p>
      </footer>
    </div>
  );
}
