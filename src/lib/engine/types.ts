// Shapes shared by the engine. Profiles are produced by scripts/build_dataset.py.

export type Summary = {
  n: number;
  p50?: number; p80?: number; p95?: number; max?: number;
  z50?: number; z80?: number; z95?: number;
};

export type PastEvent = { d: string; move: number | null; z: number | null; timing?: string };

export type Bellwether = { hub: string; n: number; ratio: number; p?: number; events: PastEvent[] };

export type Profile = {
  ticker: string;
  name: string;
  sector: string | null;
  perp: boolean;
  asOf: string;
  lastClose: number;
  volNow: number;
  normalDay: Summary;
  kDay: Record<string, Summary>;
  overnight: Summary;
  weekend: Summary;
  earnings: Summary & { events: PastEvent[] };
  fed: Summary & { events: PastEvent[] };
  bellwethers: Bellwether[];
};

export type CalibrationType = {
  raw?: { rate: number | null };
  volScaled?: { rate: number | null; checked: number };
  corrected?: { factor: number; apply: boolean; rateAfter: number; uncorrectedRateAfter: number; checkedAfter: number };
};
export type Calibration = { asOf: string; target: number; types: Record<string, CalibrationType> };

export type EventKind = "earnings" | "bellwether" | "fed" | "weekend";

export type ScheduledEvent = {
  kind: EventKind;
  date: string;            // ISO date of the trading day whose close reflects the event
  label: string;           // plain words, e.g. "NVDA earnings (after close Wed)"
  hub?: string;            // for bellwether events
  timing?: string;
};

export type Confidence = 0.8 | 0.95;

export type Trade = {
  ticker: string;
  venue: "rtoken" | "perp";
  side: "long" | "short";
  sizeUsd: number;           // notional exposure
  horizonDays: number;       // trading days held
  lossLimitUsd: number;
  leverage?: number;         // perp only
  confidence: Confidence;
};

export type Band = {
  kind: EventKind | "horizon" | "day";
  label: string;
  date?: string;
  measurable: boolean;
  n: number;
  pct: number | null;        // move size at the chosen confidence, as a fraction of price
  method: "volScaled" | "history" | "none";
  corrected?: number;        // correction factor applied, if any
};
