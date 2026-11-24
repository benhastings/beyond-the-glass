import { useState } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { curveLinear } from '@visx/curve'
import { localPoint } from '@visx/event'
import { Group } from '@visx/group'
import { scaleLinear, scaleTime } from '@visx/scale'
import { Bar, Line, LinePath } from '@visx/shape'
import { Tooltip } from '@visx/tooltip'
import { bisector, extent, max } from 'd3-array'
import { mount } from './mount'
import { fmtTime, sixHours, type Point } from './data'
const data = sixHours()
const W = 720, H = 280, M = { t: 10, r: 10, b: 30, l: 50 }
const x = scaleTime({ domain: extent(data, (d) => new Date(d.t)) as [Date, Date], range: [0, W - M.l - M.r] })
const y = scaleLinear({ domain: [0, max(data, (d) => d.p99) ?? 0], range: [H - M.t - M.b, 0], nice: true })
const bisect = bisector<Point, number>((d) => d.t).left
function Panel() {
  const [hover, setHover] = useState<Point | null>(null)
  return (
    <div style={{ position: 'relative' }}>
      <svg width={W} height={H} role="img" aria-label="p50 and p99 latency, last 6 hours">
        <Group left={M.l} top={M.t}>
          <AxisLeft scale={y} label="ms" />
          <AxisBottom top={H - M.t - M.b} scale={x} tickFormat={(d) => fmtTime((d as Date).getTime())} />
          <LinePath data={data} x={(d) => x(new Date(d.t))} y={(d) => y(d.p50)} stroke="#0A5A61" curve={curveLinear} />
          <LinePath data={data} x={(d) => x(new Date(d.t))} y={(d) => y(d.p99)} stroke="#B3541E" curve={curveLinear} />
          {hover && <Line from={{ x: x(new Date(hover.t)), y: 0 }} to={{ x: x(new Date(hover.t)), y: H - M.t - M.b }} stroke="#999" />}
          <Bar width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent"
            onMouseMove={(e) => { const p = localPoint(e); if (!p) return; const t = x.invert(p.x - M.l).getTime(); setHover(data[Math.min(bisect(data, t), data.length - 1)] ?? null) }}
            onMouseLeave={() => setHover(null)} />
        </Group>
      </svg>
      {hover && <Tooltip top={y(hover.p99)} left={x(new Date(hover.t)) + M.l}>{fmtTime(hover.t)} p50 {hover.p50.toFixed(0)} p99 {hover.p99.toFixed(0)}</Tooltip>}
      <ul aria-label="Legend"><li>p50 latency</li><li>p99 latency</li></ul>
    </div>
  )
}
mount(<Panel />)
