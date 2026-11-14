<script lang="ts">
  import { onMount } from 'svelte'
  import type { SkinViewer } from 'skinview3d'
  import { capes, skins } from './stores'

  // Mojang's default Steve texture, for accounts without a skin.
  const STEVE = 'https://textures.minecraft.net/texture/d5c4ee5ce20aed9e33e866c66caa37178606234b3721084bf01d13320fb2eb3f'

  let container = $state<HTMLDivElement | undefined>()
  let canvas = $state<HTMLCanvasElement | undefined>()
  let viewer = $state<SkinViewer | undefined>()

  let skin = $derived($skins.find((item) => item.state === 'active'))
  let cape = $derived($capes.find((item) => item.state === 'active'))

  onMount(() => {
    let disposed = false
    let resize: ResizeObserver | undefined
    void import('skinview3d').then(({ SkinViewer, IdleAnimation }) => {
      if (disposed || !canvas || !container) return
      const v = new SkinViewer({ canvas, width: container.clientWidth, height: container.clientHeight })
      v.animation = new IdleAnimation()
      v.autoRotate = true
      v.autoRotateSpeed = 0.6
      v.fov = 40
      v.zoom = 0.85
      v.controls.enableZoom = false
      v.controls.enablePan = false
      resize = new ResizeObserver(() => container && v.setSize(container.clientWidth, container.clientHeight))
      resize.observe(container)
      viewer = v
    })
    return () => {
      disposed = true
      resize?.disconnect()
      viewer?.dispose()
    }
  })

  $effect(() => {
    if (!viewer) return
    void viewer.loadSkin(skin?.url ?? STEVE, { model: skin?.variant === 'slim' ? 'slim' : 'default' }).catch(() => {})
    if (cape) void viewer.loadCape(cape.url).catch(() => {})
    else viewer.resetCape()
  })
</script>

<div class="sidebar-skin" bind:this={container}>
  <canvas bind:this={canvas} aria-label="Your Minecraft skin"></canvas>
</div>

<style>
  .sidebar-skin {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: grab;
  }
  .sidebar-skin:active {
    cursor: grabbing;
  }
  /* Out of the layout flow, so the canvas never holds its box open when the sidebar needs the space. */
  canvas {
    position: absolute;
    inset: 0;
    display: block;
  }
</style>
