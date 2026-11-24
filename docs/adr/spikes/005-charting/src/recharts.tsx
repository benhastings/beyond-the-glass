import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { mount } from './mount'
import { fmtTime, sixHours } from './data'
const data = sixHours()
mount(
  <LineChart width={720} height={280} data={data} accessibilityLayer>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} />
    <YAxis unit=" ms" />
    <Tooltip labelFormatter={(t) => fmtTime(Number(t))} />
    <Legend />
    <Line dataKey="p50" name="p50 latency" dot={false} isAnimationActive={false} stroke="#0A5A61" />
    <Line dataKey="p99" name="p99 latency" dot={false} isAnimationActive={false} stroke="#B3541E" />
  </LineChart>,
)
