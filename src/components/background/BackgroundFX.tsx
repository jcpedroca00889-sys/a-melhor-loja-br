import { useEffect, useRef } from "react";

/* ============================================================
   BACKGROUNDFX — fundo vivo global
   - 3 orbes de blur (gradientes) com parallax de mouse (lerp)
   - Canvas 2D: partículas flutuando + estrelas piscando
   - Glow laranja muito discreto; tudo leve (60fps)
   ============================================================ */

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  twinkle: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

const PARTICLE_TARGET = 55;
const STAR_TARGET = 42;

export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<HTMLDivElement>(null);

  // Parallax de mouse nos orbes (lerp em rAF, sem re-render)
  useEffect(() => {
    const orbs = orbsRef.current;
    if (!orbs) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;
    let running = true;

    const onMove = (e: MouseEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const loop = () => {
      if (!running) return;
      current.x += (target.x - current.x) * 0.04;
      current.y += (target.y - current.y) * 0.04;
      orbs.style.transform = `translate3d(${current.x * 18}px, ${current.y * 14}px, 0)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Canvas de partículas + estrelas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let last = performance.now();
    const dpr = Math.min(window.devicePixelRatio, 1.75);

    let particles: Particle[] = [];
    let stars: Star[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pCount = Math.min(PARTICLE_TARGET, Math.floor((w * h) / 32000));
      const sCount = Math.min(STAR_TARGET, Math.floor((w * h) / 42000));

      particles = Array.from({ length: pCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.03 - Math.random() * 0.09,
        twinkle: 0.35 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
      }));

      stars = Array.from({ length: sCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min(now - last, 50) / 16.67; // clamp delta
      last = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, w, h);

      // partículas (laranja, glow discreto)
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;

        const alpha = p.twinkle * (0.5 + 0.5 * Math.sin(t * 1.2 + p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 138, 0, ${Math.max(0, alpha * 0.35)})`;
        ctx.shadowColor = "rgba(255, 138, 0, 0.5)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // estrelas (brancas, piscando)
      for (const s of stars) {
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.5})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Gradientes de fundo */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(255,138,0,0.07),transparent_60%),radial-gradient(80%_60%_at_90%_110%,rgba(255,200,61,0.05),transparent_60%)]" />

      {/* Orbes de blur com parallax */}
      <div ref={orbsRef} className="absolute inset-0 will-change-transform">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/12 blur-3xl animate-float-slow" />
        <div className="absolute top-1/3 -right-32 h-[380px] w-[380px] rounded-full bg-secondary/8 blur-3xl animate-float" />
        <div className="absolute bottom-[-140px] left-1/3 h-[440px] w-[440px] rounded-full bg-primary/10 blur-3xl animate-float-slow" />
      </div>

      {/* Partículas + estrelas */}
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
