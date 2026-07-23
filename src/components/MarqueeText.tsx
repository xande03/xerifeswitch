import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MarqueeTextProps {
  text: string;
  className?: string;
  speed?: number; // px per second
}

/**
 * Single-line text that scrolls horizontally (marquee) when it overflows
 * its container. Renders as static text when it fits.
 */
const MarqueeText = ({ text, className, speed = 40 }: MarqueeTextProps) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    const measure = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      const outerW = outer.clientWidth;
      const innerW = inner.scrollWidth;
      const isOverflow = innerW > outerW + 2;
      setOverflow(isOverflow);
      if (isOverflow) {
        // Distance travelled = outerW (padding-left: 100%) + innerW
        const dist = outerW + innerW;
        setDuration(Math.max(6, dist / speed));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [text, speed]);

  return (
    <div
      ref={outerRef}
      className={cn(
        "marquee-title",
        !overflow && "marquee-title--static",
        className
      )}
    >
      <span
        ref={innerRef}
        className="marquee-title__inner"
        style={overflow ? { animationDuration: `${duration}s` } : undefined}
      >
        {text}
      </span>
    </div>
  );
};

export default MarqueeText;
