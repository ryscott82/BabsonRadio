// Simple line icons for the operations menu (24x24, drawn at any size).
const P: Record<string, string> = {
  schedule: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM8 13h3M13 13h3M8 17h3',
  slots: 'M4 5h16v11H8l-4 4V5zM8 10h8M8 13h5',
  training: 'M2 9l10-5 10 5-10 5L2 9zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6',
  updates: 'M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3zM14 8l3 3',
  library: 'M5 4h5a2 2 0 012 2v14a2 2 0 00-2-2H5V4zM19 4h-5a2 2 0 00-2 2v14a2 2 0 012-2h5V4z',
  auto: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
  setlists: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  eggs: 'M12 3l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9L12 3z',
  blocked: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 4a4 4 0 010 7.5M22 21a7 7 0 00-4-6.3',
  mail: 'M3 6h18v12H3V6zM3 7l9 7 9-7',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4',
  birthdays: 'M4 12h16v8H4v-8zM3 8h18v4H3V8zM12 8v12M12 8c-3 0-4-4-1.5-4S12 6 12 8zm0 0c3 0 4-4 1.5-4S12 6 12 8z',
  phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  bug: 'M9 7a3 3 0 016 0M7 10h10v4a5 5 0 01-10 0v-4zM3 12h4M17 12h4M4 19l3-2M20 19l-3-2M4 6l3 2M20 6l-3 2',
  requests: 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  stats: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  tests: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8',
  radio: 'M5 8h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2zM3 8l14-4M8 14a2 2 0 100 .01M13 12h5M13 16h5',
}
export type OpsIcon = keyof typeof P

export default function OpsIcon({ name, size = 48 }: { name: OpsIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  )
}
