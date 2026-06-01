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
        root: 'rounded-md'
      },
      variants: {
        variant: {
          '2xs': {
            body: 'px-2! py-1.5!',
            root: 'bg-default ring ring-default divide-y divide-default rounded-sm'
          },
          xs: {
            body: 'px-3! py-2!',
            root: 'bg-default ring ring-default divide-y divide-default rounded-sm'
          },
          sm: {
            body: 'px-4! py-3!',
            root: 'bg-default ring ring-default divide-y divide-default'
          },
          solid: {
            root: 'bg-inverted text-inverted',
            title: 'text-inverted',
            description: 'text-dimmed'
          },
          outline: {
            root: 'bg-default ring ring-default divide-y divide-default'
          },
          soft: {
            root: 'bg-elevated/50 divide-y divide-default'
          },
          subtle: {
            root: 'bg-elevated/50 ring ring-default divide-y divide-default'
          }
        }
      }
    },
    modal: {
      slots: {
        content: 'rounded-xl'
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
