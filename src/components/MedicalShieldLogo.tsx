import React from "react";

interface MedicalShieldLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showPulse?: boolean;
}

/**
 * Meaningful Medical Shield Logo
 * Represents:
 * 1. Hexagonal/Curved Clinical Shield -> High-containment Bio-Isolation & Protection
 * 2. Cross & Pulse Rhythm (ECG wave) -> Continuous Clinical Treatment & Patient Vitals
 * 3. Central Vital Node -> Real-time Monitoring & Patient Recovery
 */
export function MedicalShieldLogo({
  className = "",
  size = "md",
  showPulse = true,
}: MedicalShieldLogoProps) {
  const sizeMap = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
    xl: "w-14 h-14",
  };

  const dimension = sizeMap[size] || sizeMap.md;

  return (
    <div className={`relative flex items-center justify-center shrink-0 select-none ${dimension} ${className}`}>
      {/* Outer subtle glow ring */}
      {showPulse && (
        <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-teal-500/30 via-sky-500/30 to-emerald-500/30 blur-[2px] opacity-75 animate-pulse" />
      )}

      {/* Main Shield Emblem */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full h-full drop-shadow-md transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          {/* Shield Gradient */}
          <linearGradient id="shieldGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0284c7" /> {/* sky-600 */}
            <stop offset="50%" stopColor="#0d9488" /> {/* teal-600 */}
            <stop offset="100%" stopColor="#059669" /> {/* emerald-600 */}
          </linearGradient>

          {/* Inner Accent Gradient */}
          <linearGradient id="innerShield" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#022c22" stopOpacity="0.95" />
          </linearGradient>

          {/* Gold/Cyan Glow */}
          <linearGradient id="pulseGrad" x1="12" y1="24" x2="36" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" /> {/* sky-400 */}
            <stop offset="50%" stopColor="#34d399" /> {/* emerald-400 */}
            <stop offset="100%" stopColor="#22d3ee" /> {/* cyan-400 */}
          </linearGradient>
        </defs>

        {/* Outer Shield Boundary */}
        <path
          d="M24 4L9 9.5V22C9 32.5 15.5 41.5 24 44C32.5 41.5 39 32.5 39 22V9.5L24 4Z"
          fill="url(#shieldGrad)"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Dark Inner Shield Face */}
        <path
          d="M24 7L12 11.5V22C12 30.5 17.2 38 24 40.2C30.8 38 36 30.5 36 22V11.5L24 7Z"
          fill="url(#innerShield)"
          stroke="#14b8a6"
          strokeWidth="0.75"
        />

        {/* Medical Cross Stem (Vertical) */}
        <rect
          x="22"
          y="13"
          width="4"
          height="18"
          rx="1.5"
          fill="#f8fafc"
          fillOpacity="0.35"
        />

        {/* Medical Cross Stem (Horizontal) */}
        <rect
          x="15"
          y="20"
          width="18"
          height="4"
          rx="1.5"
          fill="#f8fafc"
          fillOpacity="0.35"
        />

        {/* Dynamic ECG Pulse Lifeline running across */}
        <path
          d="M13 24H18L20 18L24 30L27 21L29 25L31 24H35"
          stroke="url(#pulseGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Central Vital Spark / Sensor Node */}
        <circle cx="24" cy="30" r="1.8" fill="#38bdf8" />
        <circle cx="24" cy="30" r="3.2" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.6" />
      </svg>
    </div>
  );
}

export default MedicalShieldLogo;
