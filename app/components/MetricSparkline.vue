<script setup lang="ts">
/**
 * Dependency-free SVG sparkline. Plots a numeric series as a smooth-ish area +
 * line, auto-scaled to the data's min/max (with a little headroom). Used by the
 * machine metrics slide-over to show recent CPU / memory / disk / network trends.
 */
const props = withDefaults(defineProps<{
  values: number[]
  /** semantic color — drives stroke/fill via currentColor */
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  /** fix the scale to 0..max (e.g. 100 for percentages) instead of auto */
  max?: number
  min?: number
  height?: number
}>(), {
  color: 'primary',
  height: 48
})

const W = 100 // viewBox width; height is the prop, both scaled by preserveAspectRatio=none
const colorClass = computed(() => ({
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  neutral: 'text-muted'
}[props.color]))

const geom = computed(() => {
  const vals = props.values.filter(v => Number.isFinite(v))
  if (vals.length < 2) return null
  const lo = props.min ?? Math.min(...vals)
  const hiRaw = props.max ?? Math.max(...vals)
  const hi = hiRaw === lo ? lo + 1 : hiRaw // avoid divide-by-zero on flat series
  const H = props.height
  const stepX = W / (vals.length - 1)
  const pts = vals.map((v, i) => {
    const x = i * stepX
    const clamped = Math.max(lo, Math.min(hi, v))
    const y = H - ((clamped - lo) / (hi - lo)) * H
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const
  })
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${pts[pts.length - 1]![0]},${H} L${pts[0]![0]},${H} Z`
  return { line, area, last: pts[pts.length - 1]! }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    class="w-full block"
    :class="colorClass"
    :style="{ height: `${height}px` }"
    aria-hidden="true"
  >
    <template v-if="geom">
      <path
        :d="geom.area"
        fill="currentColor"
        class="opacity-10"
      />
      <path
        :d="geom.line"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle
        :cx="geom.last[0]"
        :cy="geom.last[1]"
        r="1.5"
        fill="currentColor"
        vector-effect="non-scaling-stroke"
      />
    </template>
  </svg>
</template>
