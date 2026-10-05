"use client";
import { useEffect, useState } from "react";
import s from "./sections.module.css";

type Step = { title: string; text: string; demo: React.ReactNode };
const SECONDS = 8;

/** The three steps as an accordion that walks itself forward. Touch or click a step and it stays where you put it. */
export default function HowItWorks({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setOpen((o) => (o + 1) % steps.length), SECONDS * 1000);
    return () => clearTimeout(t);
  }, [auto, open, steps.length]);

  return (
    <div className={s.acc}>
      {steps.map((st, i) => {
        const on = i === open;
        return (
          <div key={st.title} className={s.accItem} data-open={on}>
            <button type="button" className={s.accHead} aria-expanded={on} aria-controls={`how-${i}`}
              onClick={() => { setAuto(false); setOpen(i); }}>
              <span className={`${s.accN} num`}>0{i + 1}</span>
              <span className={s.accTitle}>{st.title}</span>
              <span className={s.accPlus} aria-hidden="true" />
            </button>
            <div className={s.accBodyWrap} id={`how-${i}`} role="region" aria-hidden={!on}>
              <div className={s.accBody}>
                <p>{st.text}</p>
                <div className={s.accDemo}>{st.demo}</div>
              </div>
            </div>
            {on && auto && <span key={open} className={s.accBar} style={{ animationDuration: `${SECONDS}s` }} />}
          </div>
        );
      })}
    </div>
  );
}
