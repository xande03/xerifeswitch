import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  style?: React.CSSProperties;
  tooltipLabel?: string;
  ariaLabel?: string;
  /** Cor tema principal da logo (top do gradiente + traços). Ex: "#22c55e". */
  colorFrom?: string;
  /** Cor secundária do gradiente (base). Ex: "#166534". */
  colorTo?: string;
}

const Logo = ({ className, size = 40, showText = false, style, tooltipLabel = "Xerife — Music, Video e Podcast", ariaLabel = "Logo do Xerife", colorFrom = "#22c55e", colorTo = "#166534" }: LogoProps) => {
  // Um id único por render evita colisão entre múltiplas logos com cores diferentes.
  const uid = `logo-${colorFrom.replace('#','')}-${colorTo.replace('#','')}`;
  const gradId = `${uid}-star`;
  const glowId = `${uid}-glow`;

  const content = (
    <div className={cn("flex items-center gap-3", className)} style={style}>
      <div
        style={{ width: size, height: size }}
        className="relative flex-shrink-0"
        role="img"
        aria-label={ariaLabel}
      >
        <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" className="w-full h-full" style={{ filter: `drop-shadow(0 0 15px ${colorFrom}55)` }}>
          <defs>
            <linearGradient id={gradId} x1="256" y1="100" x2="256" y2="412" gradientUnits="userSpaceOnUse">
              <stop stopColor={colorFrom}/>
              <stop offset="1" stopColor={colorTo}/>
            </linearGradient>
            <filter id={glowId} x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feFlood floodOpacity="0" result="BackgroundImageFix"/>
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
              <feOffset dx="0" dy="0"/>
              <feGaussianBlur stdDeviation="15"/>
              <feComposite in2="hardAlpha" operator="out"/>
              <feColorMatrix type="matrix" values="0 0 0 0 0.133333 0 0 0 0 0.772549 0 0 0 0 0.368627 0 0 0 0.4 0"/>
              <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
              <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
            </filter>
          </defs>

          <circle cx="256" cy="256" r="240" fill="#0A0A0A" />
          <circle cx="256" cy="256" r="238" stroke={colorFrom} strokeWidth="4" strokeOpacity="0.3" />

          <g filter={`url(#${glowId})`}>
            <path d="M256 90L295 186L395 195L318 262L342 362L256 308L170 362L194 262L117 195L217 186L256 90Z" fill={`url(#${gradId})`} stroke={colorFrom} strokeWidth="2" />

            <circle cx="256" cy="90" r="12" fill={`url(#${gradId})`} />
            <circle cx="395" cy="195" r="12" fill={`url(#${gradId})`} />
            <circle cx="342" cy="362" r="12" fill={`url(#${gradId})`} />
            <circle cx="170" cy="362" r="12" fill={`url(#${gradId})`} />
            <circle cx="117" cy="195" r="12" fill={`url(#${gradId})`} />

            <path d="M225 210L310 256L225 302V210Z" fill="white" />
          </g>

          <circle cx="256" cy="256" r="220" stroke={colorFrom} strokeWidth="1" strokeDasharray="8 12" strokeOpacity="0.2" />
        </svg>
      </div>
      
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-display font-black text-[19px] italic tracking-tight text-foreground uppercase whitespace-nowrap">
            XERIFE{" "}
            <span className="bg-gradient-to-b from-primary to-primary/70 bg-clip-text text-transparent">
              SWITCH
            </span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[8px] tracking-[0.32em] text-muted-foreground uppercase font-bold opacity-70">
            <span className="h-px w-3 bg-primary/50" />
            Music &middot; Video &middot; Podcast
          </span>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{content}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default Logo;
