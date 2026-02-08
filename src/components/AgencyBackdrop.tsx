export default function AgencyBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="agency-mesh absolute inset-0 opacity-70" />
        <div className="agency-noise absolute inset-0 opacity-[0.08]" />
        <div className="agency-scan absolute inset-0 opacity-[0.06]" />
      </div>

      <style jsx global>{`
        .agency-mesh {
          background:
            radial-gradient(1200px 600px at 10% 10%, rgba(0, 229, 255, 0.35), transparent 60%),
            radial-gradient(900px 500px at 90% 15%, rgba(255, 45, 149, 0.28), transparent 60%),
            radial-gradient(1000px 700px at 30% 90%, rgba(124, 92, 255, 0.25), transparent 60%),
            radial-gradient(800px 500px at 85% 85%, rgba(0, 255, 163, 0.18), transparent 60%),
            linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.92));
          filter: saturate(120%);
          transform: scale(1.1);
          animation: meshMove 18s ease-in-out infinite alternate;
        }

        @keyframes meshMove {
          0%   { transform: scale(1.08) translate3d(-1%, -1%, 0); }
          50%  { transform: scale(1.12) translate3d(1%, 0.5%, 0); }
          100% { transform: scale(1.10) translate3d(-0.3%, 1.2%, 0); }
        }

        .agency-noise {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
          background-size: 240px 240px;
          mix-blend-mode: overlay;
          animation: noiseMove 6s steps(2) infinite;
        }

        @keyframes noiseMove {
          0% { transform: translate3d(0,0,0); }
          25% { transform: translate3d(-1%, 1%,0); }
          50% { transform: translate3d(1%, -1%,0); }
          75% { transform: translate3d(-1%, -1%,0); }
          100% { transform: translate3d(0,0,0); }
        }

        .agency-scan {
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.06) 0px,
            rgba(255,255,255,0.06) 1px,
            transparent 2px,
            transparent 6px
          );
          mix-blend-mode: soft-light;
        }
      `}</style>
    </>
  );
}
