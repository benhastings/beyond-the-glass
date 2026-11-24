import { mount } from './mount'
import { fmtTime, sixHours } from './data'
// React plus the data and a table: the cost every panel pays anyway, subtracted from both candidates.
const data = sixHours()
mount(<table><tbody>{data.slice(0, 5).map((d) => <tr key={d.t}><td>{fmtTime(d.t)}</td><td>{d.p99.toFixed(0)}</td></tr>)}</tbody></table>)
