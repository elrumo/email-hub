<template>
  <footer class="border-t pc-hairline mt-24">
    <div class="mx-auto max-w-6xl px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm pc-dim">
      <div class="flex items-center gap-2">
        <span class="grid place-items-center w-6 h-6 rounded-[7px] bg-primary-500 text-white">
          <UIcon name="i-lucide-mail" class="w-3.5 h-3.5" />
        </span>
        <span>Postcard — design email like a native app.</span>
      </div>
      <div class="flex items-center gap-6">
        <NuxtLink to="/pricing" class="hover:text-(--pc-text)">Pricing</NuxtLink>
        <NuxtLink to="/docs/api" class="hover:text-(--pc-text)">API</NuxtLink>
        <NuxtLink to="/login" class="hover:text-(--pc-text)">Sign in</NuxtLink>
      </div>
    </div>
  </footer>
</template>
