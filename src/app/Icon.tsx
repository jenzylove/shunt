// The small line icons used for the things Shunt measures. 24 by 24, drawn with strokes.
export const ICON = {
  earnings: "M5 19V10 M12 19V5 M19 19v-6",
  fed: "M3 10 12 4l9 6 M5.5 10v8 M10 10v8 M14 10v8 M18.5 10v8 M3 20.5h18",
  weekend: "M20 14.2A8 8 0 0 1 9.8 4 8 8 0 1 0 20 14.2Z",
  bellwether: "M4 5h6v6H4z M14 13h6v6h-6z M10 8h2.5a1.5 1.5 0 0 1 1.5 1.5V13",
  liquidity: "M12 4 3 9l9 5 9-5-9-5z M3 14l9 5 9-5",
  limit: "M4 7h16 M4 17h16 M12 7v10 M9.5 14.5 12 17l2.5-2.5",
} as const;

export type IconName = keyof typeof ICON;

export default function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}
