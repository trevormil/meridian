'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Ambient hero atmosphere — three layers stacked behind everything:
 *
 *   1. Two slow-drifting CSS radial-gradient auroras (warm gold + crimson tint)
 *      give the canvas a soft glow that the circuit grid sits on top of.
 *   2. Canvas circuit-grid: a fixed set of nodes connected to nearest
 *      neighbors with hairline gold edges. Energy "pulses" spawn from random
 *      nodes and cascade outward along the edges — a pulse reaches the next
 *      node and forks to all OTHER neighbors with a slight delay. Visually:
 *      branching lightning that subsides into the grid. Trails fade over
 *      ~1.4s. New pulses spawn every ~600ms so there's always something
 *      arcing somewhere on the page.
 *   3. (z:1 in globals.css) SVG noise grain on top of everything.
 *
 * All animation is transform/opacity-only (CSS layer) + canvas (which never
 * triggers layout). Honors prefers-reduced-motion: drops the pulse rate to 0
 * and only the aurora gradients drift slowly.
 */
interface Node {
  x: number;
  y: number;
  neighbors: number[];
  pulse: number; // 0..1 — glow intensity from a recent visit
}

interface Pulse {
  from: number;
  to: number;
  /** 0..1 progress along the edge from `from`→`to`. */
  t: number;
  /** Multiplier on stroke alpha — decays over generations. */
  energy: number;
  /** How many hops back to the originating spark. Caps the cascade depth. */
  depth: number;
}

const NODE_DENSITY = 0.00012; // nodes per pixel² → ~25 nodes on a 1280x800 viewport
const MAX_NEIGHBORS = 3;
const PULSE_SPAWN_MS = 600;
const PULSE_SPEED = 0.014; // progress per frame at 60fps → ~1 edge per ~70 frames
const PULSE_TRAIL_DECAY = 0.92;
const MAX_DEPTH = 4;
const NODE_PULSE_DECAY = 0.93;

export function HeroAtmosphere() {
  const pathname = usePathname();
  // Only the marketing landing routes (/ and /landing/N) get the animated
  // circuit grid. Everywhere else gets a static, lower-energy backdrop so
  // it doesn't pull focus from the trading data.
  const isLanding =
    pathname === '/' || pathname === '/preview' || pathname?.startsWith('/landing/');
  if (!isLanding) return <StaticBackdrop />;
  return <AnimatedHeroAtmosphere />;
}

function StaticBackdrop() {
  // Two muted radial gradients + a faint static gold grid. No JS, no canvas,
  // no animation. Reads as ambient warmth without competing with any data.
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -left-[20vw] -top-[25vh] h-[80vh] w-[80vw] rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle, rgba(232,177,74,0.08) 0%, rgba(232,177,74,0.02) 35%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      <div
        className="absolute -bottom-[30vh] -right-[20vw] h-[70vh] w-[70vw] rounded-full opacity-60"
        style={{
          background:
            'radial-gradient(circle, rgba(217,56,38,0.06) 0%, transparent 60%)',
          filter: 'blur(120px)',
        }}
      />
      {/* Static gold grid — masked so it fades in the middle, then out at edges */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(232,177,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,177,74,0.04) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse 75% 55% at 50% 25%, black 35%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at 50% 25%, black 35%, transparent 78%)',
        }}
      />
    </div>
  );
}

function AnimatedHeroAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const cv: HTMLCanvasElement = canvas; // narrowed alias used inside closures
    const cx: CanvasRenderingContext2D = ctx;

    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    // Per-edge trail buffer keyed by "from-to" (ordered). Each entry holds
    // a fading alpha that recent pulses bump.
    const trails = new Map<string, number>();
    let raf = 0;
    let lastSpawn = 0;
    let visible = true;

    function edgeKey(a: number, b: number): string {
      return a < b ? `${a}-${b}` : `${b}-${a}`;
    }

    function rebuild(): void {
      const { innerWidth: w, innerHeight: h } = window;
      cv.width = w * window.devicePixelRatio;
      cv.height = h * window.devicePixelRatio;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      // Poisson-disc-ish node placement: jittered grid keeps spacing even
      // while still feeling organic.
      const count = Math.max(18, Math.round(w * h * NODE_DENSITY));
      const cols = Math.ceil(Math.sqrt((count * w) / h));
      const rows = Math.ceil(count / cols);
      const cellW = w / cols;
      const cellH = h / rows;
      nodes = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const jitterX = (Math.random() - 0.5) * cellW * 0.5;
          const jitterY = (Math.random() - 0.5) * cellH * 0.5;
          nodes.push({
            x: cellW * (c + 0.5) + jitterX,
            y: cellH * (r + 0.5) + jitterY,
            neighbors: [],
            pulse: 0,
          });
        }
      }

      // Connect each node to its K nearest neighbors.
      for (let i = 0; i < nodes.length; i++) {
        const dists = nodes
          .map((n, j) => ({ j, d: (n.x - nodes[i].x) ** 2 + (n.y - nodes[i].y) ** 2 }))
          .filter((d) => d.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, MAX_NEIGHBORS);
        nodes[i].neighbors = dists.map((d) => d.j);
      }
      // Ensure symmetric edges (so trails read identically from either direction).
      for (let i = 0; i < nodes.length; i++) {
        for (const j of nodes[i].neighbors) {
          if (!nodes[j].neighbors.includes(i)) nodes[j].neighbors.push(i);
        }
      }
    }

    function spawnPulse(): void {
      if (reduced || nodes.length === 0) return;
      const fromIdx = Math.floor(Math.random() * nodes.length);
      const from = nodes[fromIdx];
      if (from.neighbors.length === 0) return;
      const toIdx = from.neighbors[Math.floor(Math.random() * from.neighbors.length)];
      pulses.push({ from: fromIdx, to: toIdx, t: 0, energy: 1, depth: 0 });
      nodes[fromIdx].pulse = 1;
    }

    function step(): void {
      const w = cv.width / window.devicePixelRatio;
      const h = cv.height / window.devicePixelRatio;
      // Trail decay first.
      for (const [k, v] of trails) {
        const next = v * PULSE_TRAIL_DECAY;
        if (next < 0.01) trails.delete(k);
        else trails.set(k, next);
      }
      // Node-pulse decay.
      for (const n of nodes) n.pulse *= NODE_PULSE_DECAY;

      // Advance pulses + handle node arrivals.
      const next: Pulse[] = [];
      for (const p of pulses) {
        p.t += PULSE_SPEED;
        // Stamp the trail at this edge with the pulse's energy.
        const key = edgeKey(p.from, p.to);
        trails.set(key, Math.min(1, (trails.get(key) ?? 0) + p.energy * 0.08));
        if (p.t >= 1) {
          // Pulse reached `to`. Light up the node + fork to its other
          // neighbors with reduced energy.
          nodes[p.to].pulse = Math.min(1, nodes[p.to].pulse + p.energy);
          if (p.depth < MAX_DEPTH) {
            const forks = nodes[p.to].neighbors.filter((n) => n !== p.from);
            // Pick at most 2 forks so the cascade doesn't explode.
            const picks = forks.sort(() => Math.random() - 0.5).slice(0, Math.min(2, forks.length));
            for (const f of picks) {
              next.push({
                from: p.to,
                to: f,
                t: 0,
                energy: p.energy * 0.62,
                depth: p.depth + 1,
              });
            }
          }
        } else {
          next.push(p);
        }
      }
      pulses = next;

      // Render — clear and redraw the whole grid each frame. The grid is
      // small (24-40 nodes, ~100 edges) so this is fine.
      cx.clearRect(0, 0, w, h);

      // Edges: faint base + bright trail overlay.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (const j of a.neighbors) {
          if (j <= i) continue;
          const b = nodes[j];
          const trailAlpha = trails.get(edgeKey(i, j)) ?? 0;
          // Base hairline edge — always visible at very low alpha.
          cx.strokeStyle = `rgba(232, 177, 74, ${0.05 + trailAlpha * 0.55})`;
          cx.lineWidth = 1 + trailAlpha * 1.5;
          cx.beginPath();
          cx.moveTo(a.x, a.y);
          cx.lineTo(b.x, b.y);
          cx.stroke();
        }
      }

      // Pulse heads — bright dots traveling along edges.
      for (const p of pulses) {
        const a = nodes[p.from];
        const b = nodes[p.to];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const r = 2.5 + p.energy * 2.5;
        const grad = cx.createRadialGradient(x, y, 0, x, y, r * 4);
        grad.addColorStop(0, `rgba(244, 199, 102, ${p.energy * 0.95})`);
        grad.addColorStop(0.4, `rgba(232, 177, 74, ${p.energy * 0.6})`);
        grad.addColorStop(1, 'rgba(232, 177, 74, 0)');
        cx.fillStyle = grad;
        cx.beginPath();
        cx.arc(x, y, r * 4, 0, Math.PI * 2);
        cx.fill();
      }

      // Nodes — dim base + bright glow when recently pulsed.
      for (const n of nodes) {
        const glow = 0.22 + n.pulse * 0.78;
        const r = 1.8 + n.pulse * 2.8;
        const grad = cx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
        grad.addColorStop(0, `rgba(244, 199, 102, ${glow})`);
        grad.addColorStop(0.5, `rgba(232, 177, 74, ${glow * 0.35})`);
        grad.addColorStop(1, 'rgba(232, 177, 74, 0)');
        cx.fillStyle = grad;
        cx.beginPath();
        cx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
        cx.fill();
        // Hard core dot
        cx.fillStyle = `rgba(245, 239, 223, ${0.4 + n.pulse * 0.6})`;
        cx.beginPath();
        cx.arc(n.x, n.y, 1.4 + n.pulse * 1.6, 0, Math.PI * 2);
        cx.fill();
      }
    }

    function loop(t: number): void {
      if (!visible) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!reduced && t - lastSpawn > PULSE_SPAWN_MS) {
        spawnPulse();
        lastSpawn = t;
      }
      step();
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => rebuild();
    const onVis = () => { visible = !document.hidden; };

    rebuild();
    // Seed a few initial pulses so the user sees activity immediately.
    if (!reduced) {
      for (let i = 0; i < 3; i++) spawnPulse();
    }
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Aurora gradients (CSS) — warm backdrop the canvas grid rides on top of. */}
      <div className="aurora aurora-1" />
      <div className="aurora aurora-2" />
      <div className="aurora aurora-3" />

      {/* Circuit grid canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'screen' }}
      />

      <style jsx>{`
        .aurora {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          will-change: transform, opacity;
        }
        .aurora-1 {
          top: -20%;
          left: -10%;
          width: 70vw;
          height: 70vw;
          background: radial-gradient(
            circle,
            rgba(232, 177, 74, 0.16) 0%,
            rgba(232, 177, 74, 0.06) 35%,
            transparent 70%
          );
          animation: drift1 38s ease-in-out infinite alternate;
        }
        .aurora-2 {
          bottom: -25%;
          right: -15%;
          width: 60vw;
          height: 60vw;
          background: radial-gradient(
            circle,
            rgba(217, 56, 38, 0.10) 0%,
            rgba(217, 56, 38, 0.03) 35%,
            transparent 70%
          );
          animation: drift2 52s ease-in-out infinite alternate;
        }
        .aurora-3 {
          top: 40%;
          left: 60%;
          width: 35vw;
          height: 35vw;
          background: radial-gradient(
            circle,
            rgba(244, 199, 102, 0.08) 0%,
            transparent 65%
          );
          animation: drift3 30s ease-in-out infinite alternate;
        }
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.85; }
          50%      { transform: translate(18vw, 12vh) scale(1.15); opacity: 1; }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          50%      { transform: translate(-15vw, -10vh) scale(0.85); opacity: 0.95; }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0) scale(0.9); opacity: 0.5; }
          50%      { transform: translate(-22vw, 18vh) scale(1.1); opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
