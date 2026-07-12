import starlightThemeNext from 'starlight-theme-next'

/** @type {{ starlight?: import('@astrojs/starlight/types').StarlightUserConfig }} */
export default {
  starlight: {
    plugins: [starlightThemeNext()],
  },
}
