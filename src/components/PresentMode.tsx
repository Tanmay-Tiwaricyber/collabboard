import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { useBoard } from '../store/board';
import { sceneToSvg } from '../scene/renderer';
import { elementBounds, elementCenter, padBounds } from '../utils/geometry';

/** Fullscreen slide player: one frame per slide, falling back to paged view. */
export default function PresentMode({ onClose }: { onClose: () => void }) {
  const elements = useBoard((s) => s.elements);
  const theme = useBoard((s) => s.app.theme);
  const [index, setIndex] = useState(0);
  const [paged, setPaged] = useState(false);

  const slides = useMemo(() => {
    const frames = elements.filter((e) => e.type === 'frame').sort((a, b) => a.index - b.index);
    if (!frames.length) return [];
    return frames.map((f) => {
      const fb = elementBounds(f);
      const inside = elements.filter((e) => {
        if (e.type === 'frame') return false;
        const c = elementCenter(e);
        return c.x >= fb.x && c.x <= fb.x + fb.width && c.y >= fb.y && c.y <= fb.y + fb.height;
      });
      return {
        name: (f as { name?: string }).name || 'Slide',
        bounds: padBounds(fb, 12),
        svg: sceneToSvg(inside, fb, theme === 'dark' ? '#0f1016' : '#ffffff', 0),
      };
    });
  }, [elements, theme]);

  const pages = useMemo(() => {
    if (slides.length) return slides;
    if (!elements.length) return [];
    // no frames: paginate by horizontal thirds so "present" still works
    const all = elements.filter((e) => e.type !== 'frame');
    const b = padBounds(
      all.reduce(
        (acc, e) => {
          const eb = elementBounds(e);
          return {
            x: Math.min(acc.x, eb.x),
            y: Math.min(acc.y, eb.y),
            width: Math.max(acc.x + acc.width, eb.x + eb.width) - Math.min(acc.x, eb.x),
            height: Math.max(acc.y + acc.height, eb.y + eb.height) - Math.min(acc.y, eb.y),
          };
        },
        { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity },
      ),
      16,
    );
    return [
      {
        name: 'Board',
        bounds: b,
        svg: sceneToSvg(all, b, theme === 'dark' ? '#0f1016' : '#ffffff', 0),
      },
    ];
  }, [slides, elements, theme]);

  useEffect(() => setPaged(false), []);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, pages.length - 1)), [pages.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
      else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
      } else if (e.key.toLowerCase() === 'p') setPaged((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [next, prev, onClose]);

  if (!pages.length) {
    return (
      <div className="present-overlay">
        <div className="present-empty">
          <p>Nothing to present yet — draw something first, or add frames (F) to define slides.</p>
          <button className="primary-btn" onClick={onClose}>
            Back to board
          </button>
        </div>
      </div>
    );
  }

  const slide = pages[Math.min(index, pages.length - 1)];

  return (
    <div className={`present-overlay ${paged ? 'paged' : ''}`}>
      <div className="present-stage">
        <div
          className="present-slide"
          style={{ aspectRatio: `${slide.bounds.width} / ${slide.bounds.height}` }}
          dangerouslySetInnerHTML={{ __html: slide.svg }}
        />
      </div>

      <div className="present-bar">
        <button onClick={prev} disabled={index === 0} title="Previous (←)">
          <ChevronLeft size={18} />
        </button>
        <span className="present-count">
          {index + 1} / {pages.length}
          <em>{slide.name}</em>
        </span>
        <button onClick={next} disabled={index === pages.length - 1} title="Next (→)">
          <ChevronRight size={18} />
        </button>
        <span className="present-sep" />
        <button onClick={() => setPaged((v) => !v)} title="Toggle page view (P)">
          {paged ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button onClick={onClose} title="Exit (Esc)">
          <X size={17} />
        </button>
      </div>
      <p className="present-help">← → to navigate · F fullscreen · Esc to exit</p>
    </div>
  );
}
