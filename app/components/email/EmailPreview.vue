<script setup lang="ts">
/**
 * Live, email-accurate preview of an EmailDocument.
 *
 * We render the canonical email-safe HTML (the SAME renderer used for export)
 * into a sandboxed <iframe> so the email's own resets/inline styles apply
 * exactly as a mail client would show them — no leakage from the app's
 * Tailwind. To make blocks selectable we post-process the rendered DOM inside
 * the iframe: every block's outer cell is wrapped/marked with `data-block-id`,
 * and clicks are relayed back out via postMessage. The selected block gets an
 * outline overlay.
 */
import { renderEmailHtml } from '#shared/email/render'
import type { EmailDocument } from '#shared/email/blocks'

interface PreviewDevice {
  id: string
  label: string
  icon?: string
  width: number
  height: number
}

const props = defineProps<{
  document: EmailDocument
  selectedId?: string | null
  device: PreviewDevice
}>()

const emit = defineEmits<{
  (e: 'select', id: string | null): void
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const scale = ref(1)
const chromeHeight = 34

const frameWidth = computed(() => props.device.width)
const frameHeight = computed(() => props.device.height + chromeHeight)
const shellStyle = computed(() => ({
  width: `${frameWidth.value * scale.value}px`,
  height: `${frameHeight.value * scale.value}px`
}))
const deviceStyle = computed(() => ({
  width: `${frameWidth.value}px`,
  height: `${frameHeight.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left'
}))
const iframeStyle = computed(() => ({
  width: `${props.device.width}px`,
  height: `${props.device.height}px`
}))

function updateScale() {
  const el = viewport.value
  if (!el) return

  const availableWidth = Math.max(280, el.clientWidth - 32)
  const availableHeight = Math.max(360, el.clientHeight - 32)
  const nextScale = Math.min(1, availableWidth / frameWidth.value, availableHeight / frameHeight.value)
  scale.value = Math.max(0.45, Number(nextScale.toFixed(3)))
}

/**
 * Inject a tiny runtime into the iframe that:
 *  - tags each top-level block cell with its data-block-id (the renderer emits
 *    blocks as <tr><td>… so we walk the content table rows in order),
 *  - draws a hover/selected outline,
 *  - relays clicks to the parent.
 * Because the renderer order matches document.blocks order, we map row index →
 * block id here rather than threading ids through the email HTML (which must
 * stay clean for export).
 */
function buildSrcDoc(): string {
  const html = renderEmailHtml(props.document)
  const ids = props.document.blocks.map(b => b.id)
  const runtime = `
<script>
  (function () {
    var IDS = ${JSON.stringify(ids)};
    function contentRows() {
      // the inner content table is the first table with a fixed pixel width
      var tables = document.querySelectorAll('table');
      for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        if (t.getAttribute('width') && t !== tables[0]) {
          // direct child rows of this table's tbody = top-level blocks
          var tbody = t.tBodies && t.tBodies[0] ? t.tBodies[0] : t;
          return Array.prototype.filter.call(tbody.children, function (n) { return n.tagName === 'TR'; });
        }
      }
      return [];
    }
    function tag() {
      var rows = contentRows();
      rows.forEach(function (row, idx) {
        if (idx < IDS.length) row.setAttribute('data-block-id', IDS[idx]);
      });
    }
    function apply(selected) {
      var rows = document.querySelectorAll('[data-block-id]');
      rows.forEach(function (row) {
        var on = row.getAttribute('data-block-id') === selected;
        row.style.outline = on ? '2px solid #2563eb' : '';
        row.style.outlineOffset = on ? '-2px' : '';
        row.style.cursor = 'pointer';
      });
    }
    document.addEventListener('mouseover', function (e) {
      var row = e.target.closest('[data-block-id]');
      if (row && !row.style.outline) { row.style.boxShadow = 'inset 0 0 0 2px rgba(37,99,235,.35)'; }
    });
    document.addEventListener('mouseout', function (e) {
      var row = e.target.closest('[data-block-id]');
      if (row) row.style.boxShadow = '';
    });
    document.addEventListener('click', function (e) {
      var row = e.target.closest('[data-block-id]');
      var a = e.target.closest('a');
      if (a) e.preventDefault();
      parent.postMessage({ __email: true, type: 'select', id: row ? row.getAttribute('data-block-id') : null }, '*');
    });
    window.addEventListener('message', function (e) {
      if (e.data && e.data.__email && e.data.type === 'selected') apply(e.data.id);
    });
    tag();
    parent.postMessage({ __email: true, type: 'ready' }, '*');
  })();
</${''}script>`
  return html.replace('</body>', `${runtime}</body>`)
}

function postSelected() {
  frame.value?.contentWindow?.postMessage({ __email: true, type: 'selected', id: props.selectedId ?? null }, '*')
}

function onMessage(e: MessageEvent) {
  const d = e.data
  if (!d || !d.__email) return
  if (d.type === 'select') emit('select', d.id ?? null)
  if (d.type === 'ready') postSelected()
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('message', onMessage)
  updateScale()
  if (viewport.value) {
    resizeObserver = new ResizeObserver(updateScale)
    resizeObserver.observe(viewport.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  resizeObserver?.disconnect()
})

// Re-render the iframe when the document changes; re-apply selection when only
// the selection changes (cheaper than a full reload).
const srcDoc = ref(buildSrcDoc())
function rebuild() {
  srcDoc.value = buildSrcDoc()
}
watch(() => props.document, rebuild, { deep: true })
watch(() => props.selectedId, () => postSelected())
watch(() => props.device, () => nextTick(updateScale), { deep: true })
</script>

<template>
  <div
    ref="viewport"
    class="flex h-full w-full justify-center overflow-auto bg-elevated/40 p-4"
  >
    <div
      class="relative shrink-0 transition-[height,width]"
      :style="shellStyle"
    >
      <div
        class="absolute left-0 top-0 overflow-hidden rounded-lg bg-default shadow-sm ring-1 ring-default"
        :style="deviceStyle"
      >
        <div class="flex h-[34px] items-center justify-between border-b border-default bg-elevated/80 px-3">
          <div class="flex min-w-0 items-center gap-2">
            <UIcon
              :name="device.icon || 'i-lucide-monitor'"
              class="size-3.5 shrink-0 text-dimmed"
            />
            <span class="truncate text-xs font-medium text-highlighted">{{ device.label }}</span>
          </div>
          <span class="font-mono text-[11px] text-dimmed">{{ device.width }} × {{ device.height }}</span>
        </div>
        <iframe
          ref="frame"
          :srcdoc="srcDoc"
          title="Email preview"
          sandbox="allow-scripts allow-same-origin"
          class="border-0 bg-white"
          :style="iframeStyle"
        />
      </div>
    </div>
  </div>
</template>
