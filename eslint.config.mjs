// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here

  // Nuxt's default ignores include `public/**` (the static asset dir), whose
  // unanchored glob also swallows our `server/api/public/**` route folder.
  // Re-include it so the public board endpoints get linted.
  {
    ignores: ['!server/api/public/**']
  }
)
