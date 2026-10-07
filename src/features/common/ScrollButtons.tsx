import { useEffect, useState } from "react";
import { scrollButtonState } from "./scroll-state";

export function ScrollButtons() {
  const [visible, setVisible] = useState({ up: false, down: false });
  useEffect(() => {
    const update = () => setVisible(previous => {
      const root = document.scrollingElement ?? document.documentElement;
      const next = scrollButtonState(root.scrollTop, root.clientHeight, root.scrollHeight, previous);
      return next.up === previous.up && next.down === previous.down ? previous : next;
    });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    update();
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); observer.disconnect(); };
  }, []);
  const scrollTo = (top: number) => window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  return <><button type="button" hidden={!visible.up} className="scroll-button scroll-top" aria-label="ページ最上部へ" onClick={() => scrollTo(0)}>↑</button><button type="button" hidden={!visible.down} className="scroll-button scroll-bottom" aria-label="ページ最下部へ" onClick={() => scrollTo(document.documentElement.scrollHeight)}>↓</button></>;
}
