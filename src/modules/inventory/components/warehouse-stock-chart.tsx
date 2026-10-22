"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { formatDecimal } from "@/lib/decimal"
import type { WarehouseStock } from "@/modules/inventory/server/queries/dashboard"

// Bar chart "Stock Distribution by Warehouse" dashboard hmx: satu batang per gudang (qty saldo,
// 10 teratas, terbesar dulu). Satu seri, jadi tanpa legenda; lebar mengikuti wadah, tinggi tetap,
// nilai di atas batang dan tooltip saat kursor di atas batang (skill dataviz).

const H = 240
const PAD = { left: 8, right: 8, top: 24, bottom: 28 }

export function WarehouseStockChart({ rows }: { rows: WarehouseStock[] }) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  const [hover, setHover] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setWidth(Math.max(280, element.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const max = Math.max(...rows.map((row) => Number(row.qty)), 1)
  const plotW = width - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / Math.max(rows.length, 1)
  const barW = Math.min(56, slot * 0.6)
  const x = (i: number) => PAD.left + slot * i + (slot - barW) / 2
  const h = (qty: string) => Math.max(2, (Number(qty) / max) * plotH)
  const active = hover === null ? undefined : rows.at(hover)

  return (
    <div ref={frame} className="relative">
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className="block"
        role="img"
        aria-label="Distribusi stok per gudang"
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--border)"
        />
        {rows.map((row, i) => {
          const barH = h(row.qty)
          const y0 = PAD.top + plotH - barH
          return (
            <g key={row.id} onMouseEnter={() => setHover(i)}>
              {/* Area sentuh setinggi plot, lebih lebar dari batangnya. */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
              />
              <path
                d={`M${x(i)} ${PAD.top + plotH}V${y0 + 4}q0 -4 4 -4h${barW - 8}q4 0 4 4V${PAD.top + plotH}z`}
                fill="var(--chart-1)"
                fillOpacity={hover === null || hover === i ? 1 : 0.45}
              />
              <text
                x={x(i) + barW / 2}
                y={y0 - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--foreground)"
                className="tabular-nums"
              >
                {formatDecimal(row.qty)}
              </text>
              <text
                x={x(i) + barW / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted-foreground)"
                className="font-mono"
              >
                {row.code}
              </text>
            </g>
          )
        })}
      </svg>
      {active && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-3 py-2 text-caption shadow-sm"
          style={{
            left: x(hover) + barW / 2,
            transform:
              hover > rows.length / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <p className="font-medium text-foreground">{active.name}</p>
          <p className="text-muted-foreground">
            Qty saldo{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatDecimal(active.qty)}
            </span>
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Distribusi stok per gudang</caption>
        <thead>
          <tr>
            <th scope="col">Gudang</th>
            <th scope="col">Qty saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                {row.code} {row.name}
              </th>
              <td>{formatDecimal(row.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
