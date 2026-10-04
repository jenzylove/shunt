"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

/**
 * A "Check a trade" button that actually leads somewhere: it takes you to the desk and puts the cursor in the
 * box where you say your trade in words. From another page it first goes home.
 */
export default function FocusLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const go = () => {
    const focus = () => {
      document.getElementById("desk")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => document.getElementById("words")?.focus({ preventScroll: true }), 450);
    };
    if (path === "/") focus();
    else { router.push("/"); setTimeout(focus, 700); }
  };
  return <Link href="/#desk" className={className} onClick={(e) => { e.preventDefault(); go(); }}>{children}</Link>;
}
