import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-aipp-bg text-black font-sans selection:bg-black selection:text-[#c8f53c] flex flex-col">
      <Navbar />
      <main className="flex-grow flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-white border-2 border-black p-10 rounded-3xl shadow-[6px_6px_0px_#000] flex flex-col items-center text-center">
          <h1 className="text-7xl font-extrabold mb-4 font-logo">404</h1>
          <p className="text-xl font-bold mb-2">Page Not Found</p>
          <p className="text-gray-600 font-medium mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link
            href="/"
            className="bg-black text-[#c8f53c] font-bold border-2 border-black rounded-full px-8 py-4 hover:bg-[#1a1a1a] transition-all shadow-[4px_4px_0px_#000] hover:shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none text-lg"
          >
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
