import type { ReactNode } from "react";
export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
 return <span className={`status status--${tone}`}><span aria-hidden="true" className="status-dot" />{children}</span>;
}
