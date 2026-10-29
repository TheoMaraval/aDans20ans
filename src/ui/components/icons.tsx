import type { SVGProps } from 'react';
const I = (d: string) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}><path d={d} /></svg>
);
export const HomeIcon = I('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z');
export const ChartIcon = I('M4 19h16M6 15l4-4 3 3 5-6');
export const PiggyIcon = I('M5 11a7 6 0 0 1 13-2h2v4h-2a7 6 0 0 1-3 3v2h-3v-1H9v1H6v-3a6 6 0 0 1-1-4zM15 10h.01');
export const HouseIcon = I('M4 21V10l8-6 8 6v11M9 21v-6h6v6');
export const CarIcon = I('M5 16h14M6 16l1.5-5h9L18 16M7 19v-3M17 19v-3M8 13.5h.01M16 13.5h.01');
export const DebtIcon = I('M3 7h18v10H3zM3 11h18M7 15h3');
export const RepeatIcon = I('M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4');
export const ListIcon = I('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01');
export const GearIcon = I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const MoreIcon = I('M5 12h.01M12 12h.01M19 12h.01');
export const EyeIcon = I('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
export const EyeOffIcon = I('M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2');
export const LockIcon = I('M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4');
export const SaveIcon = I('M5 3h11l3 3v15H5zM8 3v5h7M8 21v-7h8v7');
export const PlusIcon = I('M12 5v14M5 12h14');
export const SunIcon = I('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4');
export const MoonIcon = I('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z');
export const AlertIcon = I('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z');
export const EditIcon = I('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z');
