import { all, create } from 'mathjs'

// drAW2D ile aynı math.js sürümü ve aynı log(a, b) davranışı.
export const math = create(all)

math.import({
  log(a: number, b?: number): number {
    return b === undefined ? Math.log(a) : Math.log(b) / Math.log(a)
  },
}, { override: true })
