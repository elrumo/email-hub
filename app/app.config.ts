export default defineAppConfig({
  ui: {
    colors: {
      // A restrained, confident blue carries actions and the brand accent —
      // color is reserved to mean something, not to decorate.
      primary: 'blue',
      // Warm-balanced gray for all chrome: text, surfaces, borders.
      neutral: 'neutral'
    },
    // Softer, more generous geometry across the surfaces that frame content.
    card: {
      slots: {
        root: 'rounded-2xl'
      }
    },
    modal: {
      slots: {
        content: 'rounded-2xl'
      }
    },
    // Quietly confident buttons — medium weight, never shouty.
    button: {
      slots: {
        base: 'font-medium rounded-lg'
      }
    }
  }
})
