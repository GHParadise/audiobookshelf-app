import { Network } from '@capacitor/network'
import { AbsAudioPlayer } from '@/plugins/capacitor'
import { PlayMethod } from '@/plugins/constants'

export const state = () => ({
  deviceData: null,
  currentPlaybackSession: null,
  playerIsPlaying: false,
  playerIsFullscreen: false,
  playerIsStartingPlayback: false, // When pressing play before native play response
  playerStartingPlaybackMediaId: null,
  isCasting: false,
  isCastAvailable: false,
  attemptingConnection: false,
  socketConnected: false,
  networkConnected: false,
  networkConnectionType: null,
  isNetworkUnmetered: true,
  isFirstLoad: true,
  isFirstAudioLoad: true,
  hasStoragePermission: false,
  selectedLibraryItem: null,
  showReader: false,
  ereaderKeepProgress: false,
  ereaderFileId: null,
  showSideDrawer: false,
  isNetworkListenerInit: false,
  serverSettings: null,
  lastBookshelfScrollData: {},
  lastItemScrollData: {},
  // 自动跳过全局配置 (默认值，如果 deviceSettings 中不存在则使用这些)
  autoSkipIntro: true,
  autoSkipEnding: true,
  defaultIntroSec: 20,
  defaultEndingSec: 16,
  bookSkipConfig: {}, // {bookId:{intro:20,ending:60}}
})

export const getters = {
  getCurrentPlaybackSessionId: (state) => {
    return state.currentPlaybackSession?.id || null
  },
  getIsPlayerOpen: (state) => {
    return !!state.currentPlaybackSession
  },
  getIsCurrentSessionLocal: (state) => {
    return state.currentPlaybackSession?.playMethod == PlayMethod.LOCAL
  },
  getIsMediaStreaming: (state) => (libraryItemId, episodeId) => {
    if (!state.currentPlaybackSession || !libraryItemId) return false

    // Check using local library item id and local episode id
    const isLocalLibraryItemId = libraryItemId.startsWith('local_')
    if (isLocalLibraryItemId) {
      if (state.currentPlaybackSession.localLibraryItem?.id !== libraryItemId) {
        return false
      }
      if (!episodeId) return true
      return state.currentPlaybackSession.localEpisodeId === episodeId
    }

    if (state.currentPlaybackSession.libraryItemId !== libraryItemId) {
      return false
    }
    if (!episodeId) return true
    return state.currentPlaybackSession.episodeId === episodeId
  },
  getServerSetting: (state) => (key) => {
    if (!state.serverSettings) return null
    return state.serverSettings[key]
  },
  getJumpForwardTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpForwardTime || 10
  },
  getJumpBackwardsTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpBackwardsTime || 10
  },
  getAltViewEnabled: (state) => {
    if (!state.deviceData?.deviceSettings) return true
    return state.deviceData.deviceSettings.enableAltView
  },
  getOrientationLockSetting: (state) => {
    return state.deviceData?.deviceSettings?.lockOrientation
  },
  getCanDownloadUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.downloadUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.downloadUsingCellular || 'ALWAYS'
  },
  getCanStreamingUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.streamingUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.streamingUsingCellular || 'ALWAYS'
  },
  /**
   * Old server versions require a token for images
   *
   * @param {*} state
   * @returns {boolean} True if server version is less than 2.17
   */
  getDoesServerImagesRequireToken: (state) => {
    const serverVersion = state.serverSettings?.version
    if (!serverVersion) return false
    const versionParts = serverVersion.split('.')
    const majorVersion = parseInt(versionParts[0])
    const minorVersion = parseInt(versionParts[1])
    return majorVersion < 2 || (majorVersion == 2 && minorVersion < 17)
  },
  // 获取自动跳过配置，优先从持久化的 deviceSettings 中读取
  getAutoSkipSettings: (state) => {
    const ds = state.deviceData?.deviceSettings || {}
    return {
      autoSkipIntro: ds.autoSkipIntro !== undefined ? ds.autoSkipIntro : state.autoSkipIntro,
      autoSkipEnding: ds.autoSkipEnding !== undefined ? ds.autoSkipEnding : state.autoSkipEnding,
      skipIntroSec: Number(ds.skipIntroSec !== undefined ? ds.skipIntroSec : state.defaultIntroSec),
      skipEndingSec: Number(ds.skipEndingSec !== undefined ? ds.skipEndingSec : state.defaultEndingSec)
    }
  },
  // 获取单本书的跳过配置
  getBookSkipSetting: (state, getters) => (bookId) => {
    const global = getters.getAutoSkipSettings
    const custom = state.bookSkipConfig[bookId]
    return {
      intro: (custom && custom.intro > 0) ? custom.intro : global.skipIntroSec,
      ending: (custom && custom.ending > 0) ? custom.ending : global.skipEndingSec
    }
  }
}

export const actions = {
  // Listen for network connection
  async setupNetworkListener({ state, commit }) {
    if (state.isNetworkListenerInit) return
    commit('setNetworkListenerInit', true)

    const status = await Network.getStatus()
    console.log('Network status', status)
    commit('setNetworkStatus', status)

    Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed', status.connected, status.connectionType)
      commit('setNetworkStatus', status)
    })

    AbsAudioPlayer.addListener('onNetworkMeteredChanged', (payload) => {
      const isUnmetered = payload.value
      console.log('On network metered changed', isUnmetered)
      commit('setIsNetworkUnmetered', isUnmetered)
    })
  }
}

export const mutations = {
  setDeviceData(state, deviceData) {
    state.deviceData = deviceData
  },
  setLastBookshelfScrollData(state, { scrollTop, path, name }) {
    state.lastBookshelfScrollData[name] = { scrollTop, path }
  },
  setLastItemScrollData(state, data) {
    state.lastItemScrollData = data
  },
  setPlaybackSession(state, playbackSession) {
    state.currentPlaybackSession = playbackSession

    state.isCasting = playbackSession?.mediaPlayer === 'cast-player'
  },
  setMediaPlayer(state, mediaPlayer) {
    state.isCasting = mediaPlayer === 'cast-player'
  },
  setCastAvailable(state, available) {
    state.isCastAvailable = available
  },
  setAttemptingConnection(state, val) {
    state.attemptingConnection = val
  },
  setPlayerPlaying(state, val) {
    state.playerIsPlaying = val
  },
  setPlayerFullscreen(state, val) {
    state.playerIsFullscreen = val
  },
  setPlayerIsStartingPlayback(state, mediaId) {
    state.playerStartingPlaybackMediaId = mediaId
    state.playerIsStartingPlayback = true
  },
  setPlayerDoneStartingPlayback(state) {
    state.playerStartingPlaybackMediaId = null
    state.playerIsStartingPlayback = false
  },
  setHasStoragePermission(state, val) {
    state.hasStoragePermission = val
  },
  setIsFirstLoad(state, val) {
    state.isFirstLoad = val
  },
  setIsFirstAudioLoad(state, val) {
    state.isFirstAudioLoad = val
  },
  setSocketConnected(state, val) {
    state.socketConnected = val
  },
  setNetworkListenerInit(state, val) {
    state.isNetworkListenerInit = val
  },
  setNetworkStatus(state, val) {
    if (val.connectionType !== 'none') {
      state.networkConnected = true
    } else {
      state.networkConnected = false
    }
    if (this.$platform === 'ios') {
      // Capacitor Network plugin only shows ios device connected if internet access is available.
      // This fix allows iOS users to use local servers without internet access.
      state.networkConnected = true
    }
    state.networkConnectionType = val.connectionType
  },
  setIsNetworkUnmetered(state, val) {
    state.isNetworkUnmetered = val
  },
  showReader(state, { libraryItem, keepProgress, fileId }) {
    state.selectedLibraryItem = libraryItem
    state.ereaderKeepProgress = keepProgress
    state.ereaderFileId = fileId

    state.showReader = true
  },
  setShowReader(state, val) {
    state.showReader = val
  },
  setShowSideDrawer(state, val) {
    state.showSideDrawer = val
  },
  setServerSettings(state, val) {
    state.serverSettings = val
    this.$localStore.setServerSettings(state.serverSettings)
  },
  SET_SKIP_INTRO_SWITCH(state, val) { state.autoSkipIntro = val },
  SET_SKIP_END_SWITCH(state, val) { state.autoSkipEnding = val },
  SET_DEFAULT_INTRO(state, num) { state.defaultIntroSec = Number(num) || 0 },
  SET_DEFAULT_END(state, num) { state.defaultEndingSec = Number(num) || 0 },
  SET_BOOK_SKIP(state, { bookId, intro, ending }) {
    state.bookSkipConfig[bookId] = {intro, ending}
  }
}
