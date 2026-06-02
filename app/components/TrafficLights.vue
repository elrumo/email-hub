<script setup lang="ts">
defineProps<{ interactive?: boolean }>()
</script>

<template>
  <span class="pc-traffic" :class="interactive ? 'group' : ''">
    <span class="red" />
    <span class="amber" />
    <span class="green" />
  </span>
</template>
