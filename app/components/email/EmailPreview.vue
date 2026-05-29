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

const props = defineProps<{
  document: EmailDocument
  selectedId?: string | null
  mode?: 'desktop' | 'mobile'
}>()

const emit = defineEmits<{
  (e: 'select', id: string | null): void
}>()

const frame = ref<HTMLIFrameElement | null>(null)

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

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

// Re-render the iframe when the document changes; re-apply selection when only
// the selection changes (cheaper than a full reload).
const srcDoc = ref(buildSrcDoc())
function rebuild() {
  srcDoc.value = buildSrcDoc()
}
watch(() => props.document, rebuild, { deep: true })
watch(() => props.selectedId, () => postSelected())
</script>

<template>
  <div class="flex h-full w-full justify-center overflow-auto bg-elevated/40 p-6">
    <div
      class="mx-auto h-fit min-h-full w-full overflow-hidden rounded-lg shadow-sm ring-1 ring-default transition-all"
      :class="mode === 'mobile' ? 'max-w-[390px]' : 'max-w-[680px]'"
    >
      <iframe
        ref="frame"
        :srcdoc="srcDoc"
        title="Email preview"
        sandbox="allow-scripts allow-same-origin"
        class="h-full min-h-[70vh] w-full border-0 bg-white"
      />
    </div>
  </div>
</template>
