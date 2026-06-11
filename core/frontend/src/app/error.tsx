"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-aipp-bg flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white border-2 border-black p-10 rounded-3xl shadow-[6px_6px_0px_#000] flex flex-col items-center text-center">
        <h1 className="text-4xl font-extrabold mb-4">Something went wrong</h1>
        <p className="text-gray-600 font-medium mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-black text-[#c8f53c] font-bold border-2 border-black rounded-full px-8 py-4 hover:bg-[#1a1a1a] transition-all shadow-[4px_4px_0px_#000] hover:shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none text-lg"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
