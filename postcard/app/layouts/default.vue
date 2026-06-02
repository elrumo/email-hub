<template>
  <div class="min-h-screen flex flex-col">
    <MarketingHeader />
    <main class="flex-1">
      <slot />
    </main>
    <MarketingFooter />
  </div>
</template>
