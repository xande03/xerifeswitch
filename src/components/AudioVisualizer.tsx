import { useEffect, useRef, useState } from "react";

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches || 
    document.documentElement.classList.contains('force-reduced-motion')
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mediaQuery.matches || document.documentElement.classList.contains('force-reduced-motion'));
    mediaQuery.addEventListener('change', onChange);
    
    // Also watch for manual override via class
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQuery.removeEventListener('change', onChange);
      observer.disconnect();
    };
  }, []);

  return reduced;
};


export type VisualizerMode = "bars" | "wave" | "dots" | "3d-ring";

interface AudioVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  className?: string;
  mode?: VisualizerMode;
}

const AudioVisualizer = ({ isPlaying, barCount = 32, className = "", mode = "bars" }: AudioVisualizerProps) => {
  const [values, setValues] = useState<number[]>(Array(barCount).fill(0.15));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isPlaying || reducedMotion) {
      setValues(Array(barCount).fill(reducedMotion ? 0.3 : 0.1));
      return;
    }


    if (mode === "3d-ring" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let rotation = 0;
      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.6;
        
        rotation += 0.01;
        
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2 + rotation;
          const h = 10 + Math.random() * 40;
          
          const x1 = centerX + Math.cos(angle) * radius;
          const y1 = centerY + Math.sin(angle) * radius;
          const x2 = centerX + Math.cos(angle) * (radius + h);
          const y2 = centerY + Math.sin(angle) * (radius + h);
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `hsla(var(--primary), ${0.4 + (h/100)})`;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        
        animationRef.current = requestAnimationFrame(render);
      };
      render();
      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }

    const interval = setInterval(() => {
      setValues(prev => prev.map(() => 0.1 + Math.random() * 0.9));
    }, 80);
    return () => clearInterval(interval);
  }, [isPlaying, barCount, mode, reducedMotion]);


  if (mode === "3d-ring") {
    return (
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={300} 
        className={`w-full h-full max-w-[300px] mx-auto ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-end gap-[1px] h-12 ${className}`}>
      {values.map((height, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-all duration-75 ${mode === 'dots' ? 'rounded-full' : ''}`}
          style={{
            height: mode === 'dots' ? `${Math.min(height * 100, 10)}%` : `${height * 100}%`,
            width: mode === 'dots' ? '4px' : 'auto',
            backgroundColor: `hsl(var(--primary))`,
            opacity: isPlaying ? 0.8 : 0.2,
            boxShadow: isPlaying ? '0 0 10px hsla(var(--primary), 0.5)' : 'none'
          }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;

