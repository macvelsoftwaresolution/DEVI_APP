import React, { useMemo, useState } from 'react';

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 32 };

const dayLabel = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// Daily SOS count columns with a hover tooltip (single series, so no legend)
export default function SosBarChart({ daily }) {
  const [hover, setHover] = useState(null);

  const { max, ticks } = useMemo(() => {
    const top = Math.max(...daily.map((d) => d.count), 0);
    const step = top <= 4 ? 1 : Math.ceil(top / 4);
    const niceMax = Math.max(step * 4, 4);
    return { max: niceMax, ticks: [0, 1, 2, 3, 4].map((i) => i * step).filter((v) => v <= niceMax) };
  }, [daily]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(daily.length, 1);
  const barW = Math.min(24, Math.max(band - 4, 2));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = daily.length > 14 ? Math.ceil(daily.length / 7) : 1;

  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="SOS alerts per day">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = Math.max(y(0) - y(d.count), d.count > 0 ? 2 : 0);
          const r = Math.min(4, h, barW / 2);
          const x0 = cx - barW / 2;
          const yTop = y(0) - h;
          // Rounded top, square at the baseline
          const path = h > 0
            ? `M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${y(0)} Z`
            : null;
          return (
            <g key={d.date}>
              <rect
                className="hit"
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotH}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${dayLabel(d.date)}: ${d.count} SOS`}</title>
              </rect>
              {path && <path className={`bar${hover === i ? ' on' : ''}`} d={path} pointerEvents="none" />}
              {i % labelEvery === 0 && (
                <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{dayLabel(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && daily[hover] && (
        <div
          className="adm-chart-tip"
          style={{
            left: `${((PAD.left + band * hover + band / 2) / W) * 100}%`,
            top: `${(y(daily[hover].count) / H) * 100}%`,
            marginTop: -8,
          }}
        >
          <strong>{daily[hover].count}</strong> SOS · {dayLabel(daily[hover].date)}
        </div>
      )}
    </div>
  );
}
