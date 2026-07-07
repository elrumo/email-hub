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
  (e: 'move', payload: { id: string, to: number }): void
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
  scale.value = Math.max(0.3, Number(nextScale.toFixed(3)))
}

/**
 * Inject a tiny runtime into the iframe that:
 *  - tags each top-level block cell with its data-block-id (the renderer emits
 *    blocks as <tr><td>… so we walk the content table rows in order),
 *  - draws a hover/selected outline,
 *  - adds editor-only drag handles and relays clicks/reorders to the parent.
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
    var selectedId = null;
    var draggedId = null;
    var dropCommitted = false;
    var currentIds = IDS.slice();

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

    function rowById(id) {
      return document.querySelector('[data-block-id="' + id + '"]');
    }

    function snapshotRows() {
      var map = {};
      contentRows().forEach(function (row) {
        map[row.getAttribute('data-block-id')] = row.getBoundingClientRect();
      });
      return map;
    }

    function animateFrom(before) {
      contentRows().forEach(function (row) {
        var id = row.getAttribute('data-block-id');
        var prev = before[id];
        if (!prev) return;
        var next = row.getBoundingClientRect();
        var dy = prev.top - next.top;
        if (!dy) return;
        row.style.transition = 'transform 0s';
        row.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () {
          row.style.transition = 'transform 180ms ease';
          row.style.transform = '';
        });
      });
    }

    function injectStyles() {
      var style = document.createElement('style');
      style.textContent = [
        '[data-block-id] { transition: opacity 140ms ease, box-shadow 140ms ease; }',
        '[data-block-id] > td { position: relative; }',
        '.email-drag-handle { align-content: center; background: #ffffff; border: 1px solid rgba(24, 24, 27, .16); border-radius: 7px; box-shadow: 0 8px 22px rgba(24, 24, 27, .16); box-sizing: border-box; cursor: grab; display: flex; flex-wrap: wrap; gap: 2px; height: 26px; justify-content: center; left: 8px; opacity: 0; padding: 6px; position: absolute; top: 50%; transform: translateY(-50%); transition: opacity 140ms ease, transform 140ms ease; width: 26px; z-index: 20; }',
        '.email-drag-handle:active { cursor: grabbing; }',
        '.email-drag-handle span { background: #71717a; border-radius: 999px; height: 3px; width: 3px; }',
        '[data-block-id]:hover .email-drag-handle, [data-block-id][data-selected="true"] .email-drag-handle, body.email-preview-dragging .email-drag-handle { opacity: 1; }',
        '[data-block-id][data-preview-dragging="true"] { opacity: .52; }'
      ].join('\\n');
      document.head.appendChild(style);
    }

    function createHandle(row) {
      var cell = row.children && row.children[0];
      if (!cell || cell.querySelector('.email-drag-handle')) return;

      var handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'email-drag-handle';
      handle.draggable = true;
      handle.setAttribute('aria-label', 'Drag block');
      for (var i = 0; i < 6; i++) handle.appendChild(document.createElement('span'));

      handle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        parent.postMessage({ __email: true, type: 'select', id: row.getAttribute('data-block-id') }, '*');
      });
      handle.addEventListener('dragstart', function (e) {
        draggedId = row.getAttribute('data-block-id');
        dropCommitted = false;
        document.body.classList.add('email-preview-dragging');
        row.setAttribute('data-preview-dragging', 'true');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggedId || '');
        }
      });
      handle.addEventListener('dragend', function () {
        document.body.classList.remove('email-preview-dragging');
        contentRows().forEach(function (r) { r.removeAttribute('data-preview-dragging'); });
        if (!dropCommitted) restoreOriginalOrder();
        draggedId = null;
      });

      cell.insertBefore(handle, cell.firstChild);
    }

    function tag() {
      var rows = contentRows();
      rows.forEach(function (row, idx) {
        if (idx < IDS.length) {
          row.setAttribute('data-block-id', IDS[idx]);
          createHandle(row);
        }
      });
    }
    function apply(selected) {
      selectedId = selected;
      var rows = document.querySelectorAll('[data-block-id]');
      rows.forEach(function (row) {
        var on = row.getAttribute('data-block-id') === selected;
        row.toggleAttribute('data-selected', on);
        row.style.outline = on ? '2px solid #2563eb' : '';
        row.style.outlineOffset = on ? '-2px' : '';
        row.style.cursor = 'pointer';
      });
    }

    function movePreview(id, insertionIndex) {
      var from = currentIds.indexOf(id);
      if (from === -1) return;

      var nextIds = currentIds.slice();
      nextIds.splice(from, 1);
      var to = Math.max(0, Math.min(from < insertionIndex ? insertionIndex - 1 : insertionIndex, nextIds.length));
      if (to === from) return;

      nextIds.splice(to, 0, id);

      var before = snapshotRows();
      var row = rowById(id);
      var nextRow = nextIds[to + 1] ? rowById(nextIds[to + 1]) : null;
      if (row && row.parentNode) row.parentNode.insertBefore(row, nextRow);
      currentIds = nextIds;
      animateFrom(before);
      apply(selectedId);
    }

    function restoreOriginalOrder() {
      var rows = contentRows();
      if (!rows.length) return;
      var before = snapshotRows();
      var parentNode = rows[0].parentNode;
      IDS.forEach(function (id) {
        var row = rowById(id);
        if (row) parentNode.appendChild(row);
      });
      currentIds = IDS.slice();
      animateFrom(before);
      apply(selectedId);
    }

    function insertionIndexFor(e, row) {
      var id = row.getAttribute('data-block-id');
      var index = currentIds.indexOf(id);
      if (index === -1) return currentIds.length;
      var rect = row.getBoundingClientRect();
      return e.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    }
    document.addEventListener('mouseover', function (e) {
      var row = e.target.closest('[data-block-id]');
      if (row && !row.style.outline) { row.style.boxShadow = 'inset 0 0 0 2px rgba(37,99,235,.35)'; }
    });
    document.addEventListener('mouseout', function (e) {
      var row = e.target.closest('[data-block-id]');
      if (row) row.style.boxShadow = '';
    });
    document.addEventListener('dragover', function (e) {
      if (!draggedId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

      var row = e.target.closest('[data-block-id]');
      if (row) {
        movePreview(draggedId, insertionIndexFor(e, row));
      } else {
        movePreview(draggedId, currentIds.length);
      }
    });
    document.addEventListener('drop', function (e) {
      if (!draggedId) return;
      e.preventDefault();
      dropCommitted = true;
      parent.postMessage({ __email: true, type: 'move', id: draggedId, to: currentIds.indexOf(draggedId) }, '*');
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
    injectStyles();
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
  if (d.type === 'move' && typeof d.id === 'string' && typeof d.to === 'number') {
    emit('move', { id: d.id, to: d.to })
  }
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
// the selection changes (cheaper than a full reload). Rebuilds are debounced:
// a full srcdoc reload per keystroke makes typing in the inspector janky.
const srcDoc = ref(buildSrcDoc())
const rebuild = useDebounceFn(() => {
  srcDoc.value = buildSrcDoc()
}, 150)
watch(() => props.document, () => rebuild(), { deep: true })
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
