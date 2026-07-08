import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Compass, ArrowRight, ExternalLink } from "lucide-react";
import { CarouselItem } from "../../../shared/types";

interface HeroCarouselProps {
  items: CarouselItem[];
  onLink: (type: string, target: string) => void;
}

export function HeroCarousel({ items, onLink }: HeroCarouselProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Auto slide rotation every 6 seconds
  useEffect(() => {
    if (!items || items.length === 0) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [items]);

  if (!items || items.length === 0) return null;

  const current = items[activeIdx];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIdx((prev) => (prev + 1) % items.length);
  };

  const getBadgeLabel = (type: string) => {
    switch (type) {
      case "subdomain":
        return "Customer Domain Portal";
      case "project-current":
        return "Active Customer Engagement";
      case "project-upcoming":
        return "Proposal Pipeline";
      case "solution":
        return "Specialized Enterprise Product";
      case "collateral":
        return "Grounding Case Study Research";
      default:
        return "Featured Spotlights";
    }
  };

  return (
    <div 
      id="spotlight-carousel-banner" 
      className="relative h-72 rounded-2xl overflow-hidden border border-slate-205 shadow-md flex select-none group transition-all"
    >
      {/* Background slide graphics with crossfade transition */}
      <div className="absolute inset-0 z-0">
        <img
          src={current.imageUrl || "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200"}
          alt=""
          className="w-full h-full object-cover brightness-[0.35] transition-all duration-1000 scale-102"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        {/* Subtle color accents overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/60 to-transparent"></div>
      </div>

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col justify-between p-8 md:p-10 text-left max-w-2xl">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/30 border border-orange-400/40 rounded-full text-[9px] font-bold text-orange-200 uppercase tracking-widest font-mono">
            <Compass className="h-3 w-3 animate-spin duration-3000" />
            {getBadgeLabel(current.linkType)}
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight leading-tight drop-shadow-xs">
            {current.title}
          </h2>
          <p className="text-xs md:text-sm text-slate-300 font-medium leading-relaxed max-w-xl">
            {current.description}
          </p>
        </div>

        {/* Dynamic Launch button triggering the customized linkType bindings */}
        {current.linkType !== "none" && current.linkTarget && (
          <button
            type="button"
            onClick={() => onLink(current.linkType, current.linkTarget)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-md transition-all self-start cursor-pointer hover:translate-x-1 duration-250"
          >
            <span>Explore Spotlight</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Manual Sliding Controls */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/40 text-white border border-white/10 hover:bg-slate-950/80 hover:scale-105 transition-all z-20 opacity-0 group-hover:opacity-100 cursor-pointer"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-4.5 w-4.5" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/40 text-white border border-white/10 hover:bg-slate-950/80 hover:scale-105 transition-all z-20 opacity-0 group-hover:opacity-100 cursor-pointer"
        aria-label="Next slide"
      >
        <ChevronRight className="h-4.5 w-4.5" />
      </button>

      {/* Index indicators dots at bottom right corner */}
      <div className="absolute bottom-6 right-8 flex space-x-2 z-20">
        {items.map((_, dotIdx) => (
          <button
            key={dotIdx}
            onClick={() => setActiveIdx(dotIdx)}
            className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
              activeIdx === dotIdx ? "bg-orange-400 w-5" : "bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Go to slide ${dotIdx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
