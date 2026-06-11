import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="border-b-2 border-black bg-aipp-bg">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        
        {/* Logo */}
        <Link href="/" className="inline-block transform -rotate-2 hover:rotate-0 transition-transform">
          <div className="bg-white border-2 border-black rounded-xl px-4 py-1 flex items-center justify-center shadow-[2px_2px_0px_#000]">
            <span className="font-logo text-3xl font-bold tracking-wider">AIPP</span>
          </div>
        </Link>
        
        {/* Buttons */}
        <div className="flex gap-4">
          <Link href="/docs" className="bg-white text-black font-bold border-2 border-black rounded-full px-6 py-2 hover:bg-black hover:text-[#c8f53c] transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            Docs
          </Link>
          <Link href="/dashboard" className="bg-black text-[#c8f53c] font-bold border-2 border-black rounded-full px-6 py-2 hover:bg-white hover:text-black transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            Müşteri Paneli
          </Link>
        </div>
      </div>
    </nav>
  );
}
