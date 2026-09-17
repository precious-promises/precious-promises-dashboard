import Link from "next/link";
import {
  BOARD_STAGES,
  PRODUCTION_STAGE_LABELS,
  type ProductionStage,
} from "@/lib/production/stage";
import styles from "./overview.module.css";

const COLOURS = [
  "#70829d",
  "#dab778",
  "#a980ee",
  "#7659d6",
  "#568acd",
  "#59ad88",
  "#77b9bf",
];
export function ProductionSummary({
  counts,
  total,
}: {
  counts: Partial<Record<ProductionStage, number>>;
  total: number;
}) {
  let offset = 0;
  const stops = BOARD_STAGES.map((stage, i) => {
    const from = offset;
    offset += total > 0 ? ((counts[stage] ?? 0) / total) * 100 : 0;
    return `${COLOURS[i]} ${from}% ${offset}%`;
  });
  return (
    <div className={styles.productionSummary}>
      <div
        className={styles.donut}
        style={{
          background:
            total > 0 ? `conic-gradient(${stops.join(",")})` : "#202838",
        }}
        role="img"
        aria-label={`${total} active content items; stage counts listed alongside`}
      >
        <span>
          <strong>{total}</strong>
          <small>In progress</small>
        </span>
      </div>
      <ol aria-label="Content production workflow">
        {BOARD_STAGES.map((stage, i) => (
          <li key={stage}>
            <Link href="/dashboard/production">
              <i aria-hidden="true" style={{ background: COLOURS[i] }} />
              <span>{PRODUCTION_STAGE_LABELS[stage]}</span>
              <strong>{counts[stage] ?? 0}</strong>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
