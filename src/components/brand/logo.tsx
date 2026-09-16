import { cn } from '@/lib/utils';

/**
 * 品牌符号渐变。多个实例在同一页面时 id 会重复，但定义完全相同，
 * 浏览器取首个定义，渲染结果一致。
 */
const GRADIENT_ID = 'xiaobu-mark-gradient';

type GlyphProps = {
  fill?: string;
  /** 左侧圆点的透明层次，让一竖两点产生前后关系 */
  dim?: number;
};

function Glyph({ fill = '#FFFFFF', dim = 0.72 }: GlyphProps) {
  return (
    <g fill={fill}>
      <rect x="440" y="200" width="144" height="624" rx="72" />
      <circle cx="318" cy="576" r="88" fillOpacity={dim} />
      <circle cx="706" cy="576" r="88" />
    </g>
  );
}

type LogoMarkProps = {
  size?: number;
  className?: string;
  /** 传值时作为 img 暴露给辅助技术，否则视为装饰 */
  title?: string;
};

/**
 * 「小步」品牌符号：一竖两点，即「小」字的几何化。
 * 用于 app icon、favicon、侧边栏与页头标识。
 */
export function LogoMark({ size = 32, className, title }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="14%" y1="12%" x2="86%" y2="88%">
          <stop offset="0%" stopColor="#365DF5" />
          <stop offset="48%" stopColor="#5146E5" />
          <stop offset="100%" stopColor="#6E5BFF" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill={`url(#${GRADIENT_ID})`} />
      <Glyph />
    </svg>
  );
}

type LogoGlyphProps = {
  size?: number;
  className?: string;
  color?: string;
};

/** 透明底纯符号，用于需要单色或自定底色的场合 */
export function LogoGlyph({ size = 24, className, color = 'currentColor' }: LogoGlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={cn('shrink-0', className)} aria-hidden="true">
      <Glyph fill={color} />
    </svg>
  );
}
