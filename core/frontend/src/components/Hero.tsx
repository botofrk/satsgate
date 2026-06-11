import Image from "next/image";

export default function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-20 flex flex-col md:flex-row items-center gap-16">
      
      {/* Left: Robot Image */}
      <div className="flex-1 flex justify-center md:justify-end">
        <div className="relative w-[300px] md:w-[450px]">
          <Image 
            src="/assets/robot-v2.png" 
            alt="AIPP Robot" 
            width={500} 
            height={500} 
            className="w-full h-auto drop-shadow-[15px_15px_0px_rgba(0,0,0,0.15)]"
            priority
          />
        </div>
      </div>

      {/* Right: Text Content */}
      <div className="flex-1 flex flex-col items-start gap-6">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#d1f75d] border border-black/10 rounded-full text-xs font-bold tracking-widest text-black">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M11 21.883l-6.205-11.567 8.505-1.326-1.559-4.99 6.205 11.567-8.505 1.326z"/></svg>
          LIGHTNING L402 PAYWALL FOR AI AGENTS
        </div>

        {/* Heading */}
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] text-black">
          AI Payment Protocol <br/>
          Built on <span className="underline decoration-black decoration-[5px] underline-offset-4">Lightning L402</span>
        </h1>
        
        {/* Subtitle */}
        <p className="text-lg text-[#1a1a1a] font-medium max-w-lg leading-relaxed">
          Give your AI agents the ability to pay and get paid - instantly, globally, without borders. One API key, every network.
        </p>

        {/* Buttons */}
        <div className="flex flex-wrap gap-4 mt-2">
          <a href="/dashboard" className="bg-black text-[#c8f53c] font-bold border-2 border-black rounded-full px-8 py-4 hover:bg-white hover:text-black transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none text-lg flex items-center gap-2">
            Get Free API Key
          </a>
          <a href="/login" className="bg-white text-black font-bold border-2 border-black rounded-full px-8 py-4 hover:bg-gray-50 transition-all shadow-[2px_2px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none text-lg">
            Learn More
          </a>
        </div>
      </div>
      
    </section>
  );
}
