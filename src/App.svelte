<script lang="ts">
  import { onMount } from 'svelte'
  import logger from 'electron-log/renderer'
  import { auth, background, bootstraps } from './ipc'
  import { blocking, launcherReady, overlay, page, requestedProfile, showDialog } from './renderer/stores'
  import { loadSessionAssets } from './renderer/session'
  import LoginView from './renderer/LoginView.svelte'
  import HomeView from './renderer/HomeView.svelte'
  import SettingsView from './renderer/SettingsView.svelte'
  import ProfileUnlock from './renderer/ProfileUnlock.svelte'
  import DialogHost from './renderer/DialogHost.svelte'
  import CrashReportPrompt from './renderer/CrashReportPrompt.svelte'
  // Every image dropped in static/images/backgrounds/ joins the rotation (sorted by file name).
  const bundledBackgrounds = Object.entries(
    import.meta.glob<string>('./static/images/backgrounds/*.{webp,png,jpg,jpeg}', { eager: true, import: 'default' })
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url)
  const SLIDE_MS = 12000

  let backgrounds = $state<string[]>(bundledBackgrounds)
  let currentBackground = $state(0)
  let loadingHidden = $state(false)
  let showLoading = $state(true)

  onMount(() => {
    void initialize()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setInterval(async () => {
      if (reduceMotion || backgrounds.length < 2) return
      const next = (currentBackground + 1) % backgrounds.length
      await preloadImage(backgrounds[next])
      currentBackground = next
    }, SLIDE_MS)
    return () => {
      window.clearInterval(timer)
      document.body.classList.remove('loaded')
    }
  })

  async function initialize() {
    logger.log('Initializing launcher...')
    let downloadingUpdate = false
    try {
      const [update, uploaded] = await Promise.all([bootstraps.check(), background.list()])
      // Backgrounds uploaded in the AdminTool come first (active one leading), then the bundled ones.
      if (uploaded.length) backgrounds = [...uploaded, ...bundledBackgrounds]

      if (update.updateAvailable) {
        downloadingUpdate = true
        blocking.set({ kind: 'update', label: 'Preparing update...', percent: 0 })
        bootstraps.downloadProgress((value) => {
          const percent = value.total.size ? (value.downloaded.size / value.total.size) * 100 : 0
          blocking.set({ kind: 'update', label: 'Downloading update...', percent })
        })
        bootstraps.downloadEnd(async () => {
          blocking.set({ kind: 'update', label: 'Installing...', percent: null })
          await bootstraps.install()
        })
        bootstraps.error((error) => logger.error('Error while downloading bootstraps:', error))
        await bootstraps.download()
        logger.log('Update installed, restarting launcher...')
        window.setTimeout(() => window.location.reload(), 1000)
        return
      }

      if (update.manualUpdate && update.releaseUrl) {
        const releaseUrl = update.releaseUrl
        void showDialog(
          `Version ${update.manualUpdate} of the launcher is out. macOS can't install it automatically, so download it and drag it into Applications again.`,
          [
            { text: 'Later', type: 'cancel' },
            { text: 'Download', type: 'ok', action: () => void window.open(releaseUrl, '_blank') }
          ],
          'Launcher update'
        )
      }

      if (backgrounds[0]) await preloadImage(backgrounds[0])
      const session = await auth.refresh()
      if (session.success) {
        await loadSessionAssets(session.account)
        page.set('home')
      } else page.set('login')
    } catch (error) {
      logger.error('Error while initializing launcher:', error)
      blocking.set({ kind: 'none' })
      page.set('login')
      if (downloadingUpdate)
        await showDialog('The launcher update could not be completed. Please restart and try again.', [{ text: 'OK', type: 'ok' }], 'Update failed')
    } finally {
      loadingHidden = true
      launcherReady.set(true)
      window.setTimeout(() => (showLoading = false), 450)
      window.setTimeout(() => document.body.classList.add('loaded'), 200)
    }
  }

  function preloadImage(url: string) {
    return new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => resolve()
      image.src = url
    })
  }
</script>

{#if showLoading || !$launcherReady || $blocking.kind !== 'none'}
  <div id="view-loading" class="loading" class:loaded={loadingHidden}>
    <div class="loading-card">
      <p class="spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></p>
      <p class="text">Loading...</p>
    </div>
  </div>
{/if}

{#if $blocking.kind === 'update'}
  <div id="view-update" class="update loaded">
    <div class="maintenance-card">
      <p class="up"><i class="fa-solid fa-circle-up"></i></p>
      <h3>An update is available</h3>
      <p class="text">Please wait while we update your launcher...</p>
      <div class="progress-container">
        <div class="progress-info">
          <span>{$blocking.label}</span><span>{$blocking.percent === null ? '' : `${$blocking.percent.toFixed(2)}%`}</span>
        </div>
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            class:indeterminate={$blocking.percent === null}
            style:width={$blocking.percent === null ? undefined : `${$blocking.percent}%`}
          ></div>
        </div>
      </div>
    </div>
  </div>
{/if}

<div id="app">
  {#each backgrounds as url, i (url)}
    <div class="app-background" class:active={i === currentBackground} style:background-image={`url('${url}')`}></div>
  {/each}
  {#if $page === 'login'}
    <LoginView />
  {:else if $page === 'home'}
    <HomeView />
  {/if}

  {#if $overlay === 'settings'}
    <SettingsView />
  {:else if $overlay === 'profile' && $requestedProfile}
    <ProfileUnlock profile={$requestedProfile} />
  {/if}
</div>
<DialogHost />
<CrashReportPrompt />

<style lang="scss">
  @use './static/styles/loading.scss' as *;
  @use './static/styles/maintenance.scss' as *;
  @use './static/styles/update.scss' as *;

  div.loading,
  div.maintenance,
  div.update {
    position: fixed;
    top: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
    background-color: #121212;
    transition: opacity 0.4s ease-in-out;
    z-index: 2000;
  }

  div.app-background { opacity: 0; transition: opacity 1.5s ease-in-out; }
  div.app-background.active { opacity: 1; }

  div.loading { opacity: 1; }
  div.loading.loaded { opacity: 0; }
  div.maintenance,
  div.update { opacity: 0; }
  div.maintenance.loaded,
  div.update.loaded { opacity: 1; }
</style>
