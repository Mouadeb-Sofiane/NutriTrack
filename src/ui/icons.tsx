/** Petites icônes SVG en ligne (aucune dépendance, fonctionne hors ligne). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconToday = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconMeals = (p: P) => <Svg {...p}><path d="M5 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M7 13v8M17 21V3c-2.2 1-3.5 3.5-3.5 7v3H17" /></Svg>;
export const IconChart = (p: P) => <Svg {...p}><path d="M4 19h16M7 16v-5M12 16V7M17 16v-8" /></Svg>;
export const IconBulb = (p: P) => <Svg {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconChevronLeft = (p: P) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
export const IconCamera = (p: P) => <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" /><path d="M5 16a4 4 0 0 1 4-4h10" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconScale = (p: P) => <Svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8.5 9a5 5 0 0 1 7 0L13 12" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></Svg>;
export const IconBarcode = (p: P) => <Svg {...p}><path d="M4 6v12M7 6v12M11 6v12M14 6v12M18 6v12M20 6v12" /></Svg>;
export const IconWand = (p: P) => <Svg {...p}><path d="M5 19L15 9M14 4v2M19 9h2M17.5 5.5l-1.5 1.5M19 4l1 1" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconFlame = (p: P) => <Svg {...p}><path d="M12 21c4 0 7-2.7 7-6.5 0-3.5-2.5-5.5-4-8.5-1 2.5-2.5 3.5-3.5 3.5C11 7 11 5 12 3c-4 2-7 6.5-7 11.5C5 18.3 8 21 12 21z" /></Svg>;
export const IconStore = (p: P) => <Svg {...p}><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6" /></Svg>;
export const IconHome = (p: P) => <Svg {...p}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></Svg>;
export const IconText = (p: P) => <Svg {...p}><path d="M5 6h14M5 10h14M5 14h9M5 18h6" /></Svg>;
export const IconBolt = (p: P) => <Svg {...p}><path d="M13 3L5 13h6l-1 8 8-10h-6z" /></Svg>;
export const IconFamily = (p: P) => <Svg {...p}><circle cx="8" cy="7" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c.5-4 2.5-6.5 5-6.5s4.5 2.5 5 6.5M13.5 20c.4-3 1.7-5 3.5-5s3.1 2 3.5 5" /></Svg>;
export const IconCookie = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9 9h.01M14.5 8.5h.01M15 14h.01M9.5 14.5h.01M12 11.5h.01" strokeWidth={2.6} /></Svg>;
export const IconBurger = (p: P) => <Svg {...p}><path d="M4 10a8 5 0 0 1 16 0zM3.5 13.5h17M5 17h14a1 1 0 0 1-1 3H6a1 1 0 0 1-1-3z" /></Svg>;
