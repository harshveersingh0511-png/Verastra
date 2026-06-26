/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — MOTION
   Shared animation primitives. Used across all surfaces.
   ────────────────────────────────────────────────────────────────────── */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Count-up — animates a numeric value from 0 → target on first render */

export function countUp(el, target, opts = {}) {
  const {
    duration = 1200,
    decimals = 0,
    prefix = '',
    suffix = '',
    formatter,
  } = opts;

  if (REDUCED) {
    el.textContent = formatter
      ? formatter(target)
      : `${prefix}${target.toFixed(decimals)}${suffix}`;
    return;
  }

  const start = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 4); // easeOutExpo-ish

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = target * ease(t);
    el.textContent = formatter
      ? formatter(v)
      : `${prefix}${v.toFixed(decimals)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = formatter
      ? formatter(target)
      : `${prefix}${target.toFixed(decimals)}${suffix}`;
  }
  requestAnimationFrame(frame);
}

/* Reveal on scroll — fades + lifts elements as they enter viewport */

export function reveal(selector = '[data-reveal]') {
  if (REDUCED) {
    document.querySelectorAll(selector).forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  const els = document.querySelectorAll(selector);
  els.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)';
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, delay);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  els.forEach(el => io.observe(el));
}

/* Stagger — applies sequential delays to a list of elements */

export function stagger(selector, stepMs = 60) {
  document.querySelectorAll(selector).forEach((el, i) => {
    el.dataset.revealDelay = String(i * stepMs);
  });
}

/* Draw line — animates SVG path stroke-dashoffset to draw the line */

export function drawLine(pathEl, duration = 1400) {
  if (!pathEl) return;
  if (REDUCED) return;
  const len = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = String(len);
  pathEl.style.strokeDashoffset = String(len);
  pathEl.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.19, 1, 0.22, 1)`;
  requestAnimationFrame(() => {
    pathEl.style.strokeDashoffset = '0';
  });
}
