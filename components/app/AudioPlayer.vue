<template>
  <div v-if="playbackSession" id="streamContainer" class="fixed top-0 left-0 layout-wrapper right-0 z-50 pointer-events-none" :class="{ fullscreen: showFullscreen, 'ios-player': $platform === 'ios', 'web-player': $platform === 'web' }">
    <!-- 全屏背景层 -->
    <div v-if="showFullscreen" class="w-full h-full z-10 absolute top-0 left-0 pointer-events-auto" :style="{ backgroundColor: coverRgb }">
      <div class="w-full h-full absolute top-0 left-0 pointer-events-none" style="background: var(--gradient-audio-player)" />

      <!-- 顶部控制按钮 -->
      <div class="top-4 left-4 absolute cursor-pointer">
        <span class="material-symbols text-5xl" :class="{ 'text-black text-opacity-75': coverBgIsLight && theme !== 'black' }" @click="collapseFullscreen">keyboard_arrow_down</span>
      </div>
      <div v-show="showCastBtn" class="top-6 right-16 absolute cursor-pointer">
        <span class="material-symbols text-3xl" :class="coverBgIsLight && theme !== 'black' ? 'text-black' : ''" @click="castClick">{{ isCasting ? 'cast_connected' : 'cast' }}</span>
      </div>
      <div class="top-6 right-4 absolute cursor-pointer">
        <span class="material-symbols text-3xl" :class="{ 'text-black text-opacity-75': coverBgIsLight && theme !== 'black' }" @click="showMoreMenuDialog = true">more_vert</span>
      </div>
      <p class="top-4 absolute left-0 right-0 mx-auto text-center uppercase tracking-widest text-opacity-75" :class="{ 'text-black text-opacity-75': coverBgIsLight && theme !== 'black' }" style="font-size: 10px">{{ isDirectPlayMethod ? $strings.LabelPlaybackDirect : isLocalPlayMethod ? $strings.LabelPlaybackLocal : $strings.LabelPlaybackTranscode }}</p>
    </div>

    <!-- 全屏模式下的总进度条 (顶部) -->
    <div v-if="playerSettings.useChapterTrack && playerSettings.useTotalTrack && showFullscreen" class="absolute total-track w-full z-30 px-6" style="top: 15%">
      <div class="flex">
        <p class="font-mono text-fg" style="font-size: 0.8rem">{{ currentTimePretty }}</p>
        <div class="flex-grow" />
        <p class="font-mono text-fg" style="font-size: 0.8rem">{{ totalTimeRemainingPretty }}</p>
      </div>
      <div class="w-full">
        <div class="h-1 w-full bg-track/50 relative rounded-full">
          <div ref="totalReadyTrack" class="h-full bg-track-buffered absolute top-0 left-0 pointer-events-none rounded-full" />
          <div ref="totalBufferedTrack" class="h-full bg-track absolute top-0 left-0 pointer-events-none rounded-full" />
          <div ref="totalPlayedTrack" class="h-full bg-track-cursor absolute top-0 left-0 pointer-events-none rounded-full" />
        </div>
      </div>
    </div>

    <!-- 封面层 -->
    <div class="cover-wrapper absolute z-30 pointer-events-auto" @click="clickContainer">
      <div class="w-full h-full flex justify-center">
        <covers-book-cover v-if="libraryItem || localLibraryItemCoverSrc" ref="cover" :library-item="libraryItem" :download-cover="localLibraryItemCoverSrc" :width="bookCoverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" raw @imageLoaded="coverImageLoaded" />
      </div>
      <div v-if="syncStatus === $constants.SyncStatus.FAILED" class="absolute top-0 left-0 w-full h-full flex items-center justify-center z-30" @click.stop="showSyncsFailedDialog">
        <span class="material-symbols text-error text-3xl">error</span>
      </div>
    </div>

    <!-- 标题作者层 (全屏下显示) -->
    <div v-if="showFullscreen" class="title-author-texts absolute z-30 left-0 right-0 overflow-hidden" @click="clickTitleAndAuthor">
      <div ref="titlewrapper" class="overflow-hidden relative">
        <p class="title-text whitespace-nowrap"></p>
      </div>
      <p class="author-text text-fg text-opacity-75 truncate">{{ authorName }}</p>
    </div>

    <!-- 【核心修复】底部播放控制栏 -->
    <div id="playerContent"
      class="playerContainer w-full z-40 absolute bottom-0 left-0 right-0 pointer-events-auto transition-all"
      :style="{
        backgroundColor: showFullscreen ? 'transparent' : coverRgb,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        minHeight: showFullscreen ? '220px' : 'calc(76px + env(safe-area-inset-bottom))'
      }"
      @click="clickContainer">

      <!-- 迷你播放器背景遮罩 -->
      <div v-if="!showFullscreen" class="w-full h-full absolute top-0 left-0 pointer-events-none" style="background: var(--gradient-minimized-audio-player)" />

      <!-- 1. 进度条 (置于顶部，保证无论如何都能看见) -->
      <div id="playerTrack" class="absolute top-0 left-0 w-full px-6 transform -translate-y-1/2">
        <div v-if="showFullscreen" class="flex pointer-events-none mb-1">
          <p class="font-mono text-fg" style="font-size: 0.8rem" ref="currentTimestamp">0:00</p>
          <div class="flex-grow" />
          <p class="font-mono text-fg" style="font-size: 0.8rem">{{ timeRemainingPretty }}</p>
        </div>
        <div ref="track" class="h-1.5 w-full bg-track/50 relative rounded-full" :class="{ 'animate-pulse': showLoadingState }" @click.stop>
          <div ref="readyTrack" class="h-full bg-track-buffered absolute top-0 left-0 rounded-full pointer-events-none" />
          <div ref="bufferedTrack" class="h-full bg-track absolute top-0 left-0 rounded-full pointer-events-none" />
          <div ref="playedTrack" class="h-full bg-track-cursor absolute top-0 left-0 rounded-full pointer-events-none" />
          <div ref="trackCursor" class="h-8 w-8 rounded-full absolute pointer-events-auto flex items-center justify-center" :style="{ top: '-13px' }" :class="{ 'opacity-0': playerSettings.lockUi || !showFullscreen }" @touchstart="touchstartCursor">
            <div class="bg-track-cursor rounded-full w-4 h-4 shadow-sm pointer-events-none" />
          </div>
        </div>
      </div>

      <!-- 2. 控制按钮区域 -->
      <div class="relative w-full h-full flex flex-col justify-center px-4">

        <!-- 迷你模式下的文字 (可选修复：当非全屏时显示) -->
        <div v-if="!showFullscreen" class="flex items-center mb-1 pr-32 overflow-hidden">
           <p class="text-fg truncate text-sm font-semibold">{{ title }}</p>
        </div>

        <!-- 按钮主容器 -->
        <div id="playerControls" class="w-full flex items-center justify-center space-x-4 pt-2">
          <!-- 上一章 -->
          <span v-show="showFullscreen && !playerSettings.lockUi" class="material-symbols text-4xl text-fg cursor-pointer opacity-75" @click.stop="jumpChapterStart">first_page</span>

          <!-- 后退 -->
          <div v-show="!playerSettings.lockUi" class="flex flex-col items-center cursor-pointer text-fg opacity-75" @click.stop="jumpBackwards">
            <span class="material-symbols text-4xl">replay</span>
            <span v-if="showFullscreen" class="text-[10px] font-bold">{{ jumpBackwardsLabel }}</span>
          </div>

          <!-- 播放/暂停 -->
          <div class="play-btn cursor-pointer shadow-lg flex items-center justify-center rounded-full text-primary relative overflow-hidden h-16 w-16"
            :style="{ backgroundColor: coverRgb }"
            :class="{ 'animate-spin': seekLoading }"
            @click.stop="playPauseClick">
            <div v-if="!coverBgIsLight" class="absolute top-0 left-0 w-full h-full bg-white bg-opacity-20 pointer-events-none" />
            <span v-if="!showLoadingState" class="material-symbols text-5xl fill" :class="{ 'text-white': coverRgb && !coverBgIsLight }">{{ seekLoading ? 'autorenew' : !isPlaying ? 'play_arrow' : 'pause' }}</span>
            <widgets-spinner-icon v-else class="h-10 w-10" />
          </div>

          <!-- 前进 -->
          <div v-show="!playerSettings.lockUi" class="flex flex-col items-center cursor-pointer text-fg opacity-75" @click.stop="jumpForward">
            <span class="material-symbols text-4xl">forward_media</span>
            <span v-if="showFullscreen" class="text-[10px] font-bold">{{ jumpForwardLabel }}</span>
          </div>

          <!-- 下一章 -->
          <span v-show="showFullscreen && !playerSettings.lockUi" class="material-symbols text-4xl text-fg cursor-pointer" :class="nextChapter ? 'opacity-75' : 'opacity-10'" @click.stop="jumpNextChapter">last_page</span>
        </div>

        <!-- 全屏模式下的底部辅助按钮 (语速、睡眠等) -->
        <div v-if="showFullscreen" class="flex items-center justify-between mt-8 px-6 pb-2">
          <span v-if="!isPodcast && serverLibraryItemId && socketConnected" class="material-symbols text-3xl text-fg-muted cursor-pointer" :class="{ fill: bookmarks.length }" @click="$emit('showBookmarks')">bookmark</span>
          <span v-else class="material-symbols text-3xl text-transparent pointer-events-none">bookmark</span>

          <span class="font-mono text-fg-muted cursor-pointer text-2xl" @click="$emit('selectPlaybackSpeed')">{{ currentPlaybackRate }}x</span>

          <div class="cursor-pointer" @click.stop="$emit('showSleepTimer')">
            <span v-if="!sleepTimerRunning" class="material-symbols text-3xl text-fg-muted">bedtime</span>
            <p v-else class="text-xl font-mono text-success">{{ sleepTimeRemainingPretty }}</p>
          </div>

          <span class="material-symbols text-3xl text-fg cursor-pointer opacity-75" @click="clickChaptersBtn">format_list_bulleted</span>
        </div>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <modals-chapters-modal v-model="showChapterModal" :current-chapter="currentChapter" :chapters="chapters" :playback-rate="currentPlaybackRate" @select="selectChapter" />
    <modals-dialog v-model="showMoreMenuDialog" :items="menuItems" width="80vw" @action="clickMenuAction" />
  </div>
</template>

<script>
import { Capacitor } from '@capacitor/core'
import { AbsAudioPlayer } from '@/plugins/capacitor'
import { Dialog } from '@capacitor/dialog'
import { getAverageColorFromCoverUrl } from '@/utils/coverAverageColor'
import WrappingMarquee from '@/assets/WrappingMarquee.js'
import jumpLabelMixin from '@/mixins/jumpLabel'

export default {
  props: {
    bookmarks: {
      type: Array,
      default: () => []
    },
    sleepTimerRunning: Boolean,
    sleepTimeRemaining: Number,
    serverLibraryItemId: String
  },
  mixins: [jumpLabelMixin],
  data() {
    return {
      windowHeight: 0,
      windowWidth: 0,
      playbackSession: null,
      showChapterModal: false,
      showFullscreen: false,
      totalDuration: 0,
      currentPlaybackRate: 1,
      currentTime: 0,
      bufferedTime: 0,
      playInterval: null,
      trackWidth: 0,
      isPlaying: false,
      isEnded: false,
      volume: 0.5,
      readyTrackWidth: 0,
      seekedTime: 0,
      seekLoading: false,
      touchStartY: 0,
      touchStartTime: 0,
      playerSettings: {
        useChapterTrack: false,
        useTotalTrack: true,
        scaleElapsedTimeBySpeed: true,
        lockUi: false
      },
      isLoading: false,
      isCheckingServerProgress: false,
      isDraggingCursor: false,
      draggingTouchStartX: 0,
      draggingTouchStartTime: 0,
      draggingCurrentTime: 0,
      syncStatus: 0,
      showMoreMenuDialog: false,
      coverRgb: 'rgb(55, 56, 56)',
      coverBgIsLight: false,
      titleMarquee: null,
      isRefreshingUI: false,
      hasSkippedIntro: false,
      hasSkippedEnding: false,
      currentActiveChapterId: null
    }
  },
  watch: {
    // 监听播放会话变化（切集时触发）
    playbackSession(newVal, oldVal) {
      if (newVal && newVal.id !== oldVal?.id) {
        console.log('[Player] 检测到切集，重置跳过标记')
        this.hasSkippedIntro = false
        this.hasSkippedEnding = false
        this.currentActiveChapterId = null
        this.isDraggingCursor = false // 强制重置拖拽状态
      }
    },
    showFullscreen(val) {
      this.updateScreenSize()
      this.$store.commit('setPlayerFullscreen', !!val)
      document.querySelector('body').style.backgroundColor = this.showFullscreen ? this.coverRgb : ''
    },
    bookCoverAspectRatio() {
      this.updateScreenSize()
    },
    title(val) {
      if (this.titleMarquee) this.titleMarquee.init(val)
    }
  },
  computed: {
    skipSettings() {
      const settings = this.$store.getters['getAutoSkipSettings'] || {}
      return {
        autoSkipIntro: !!settings.autoSkipIntro,
        autoSkipEnding: !!settings.autoSkipEnding,
        skipIntroSec: Number(settings.skipIntroSec || 0),
        skipEndingSec: Number(settings.skipEndingSec || 0)
      }
    },
    theme() {
      return document.documentElement.dataset.theme || 'dark'
    },
    menuItems() {
      const items = []
      // TODO: Implement on iOS
      if (this.$platform !== 'ios' && !this.isPodcast && this.mediaId) {
        items.push({
          text: this.$strings.ButtonHistory,
          value: 'history',
          icon: 'history'
        })
      }

      items.push(
        ...[
          {
            text: this.$strings.LabelTotalTrack,
            value: 'total_track',
            icon: this.playerSettings.useTotalTrack ? 'check_box' : 'check_box_outline_blank'
          },
          {
            text: this.$strings.LabelChapterTrack,
            value: 'chapter_track',
            icon: this.playerSettings.useChapterTrack ? 'check_box' : 'check_box_outline_blank'
          },
          {
            text: this.$strings.LabelScaleElapsedTimeBySpeed,
            value: 'scale_elapsed_time',
            icon: this.playerSettings.scaleElapsedTimeBySpeed ? 'check_box' : 'check_box_outline_blank'
          },
          {
            text: this.playerSettings.lockUi ? this.$strings.LabelUnlockPlayer : this.$strings.LabelLockPlayer,
            value: 'lock',
            icon: this.playerSettings.lockUi ? 'lock' : 'lock_open'
          },
          {
            text: this.$strings.LabelClosePlayer,
            value: 'close',
            icon: 'close'
          }
        ]
      )

      return items
    },
    jumpForwardLabel() {
      return this.getJumpLabel(this.jumpForwardTime)
    },
    jumpBackwardsLabel() {
      return this.getJumpLabel(this.jumpBackwardsTime)
    },
    jumpForwardTime() {
      return this.$store.getters['getJumpForwardTime']
    },
    jumpBackwardsTime() {
      return this.$store.getters['getJumpBackwardsTime']
    },
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    bookCoverWidth() {
      if (this.showFullscreen) return this.fullscreenBookCoverWidth
      return 46 / this.bookCoverAspectRatio
    },
    fullscreenBookCoverWidth() {
      if (this.windowWidth < this.windowHeight) {
        // Portrait
        let sideSpace = 20
        if (this.bookCoverAspectRatio === 1.6) sideSpace += (this.windowWidth - sideSpace) * 0.375

        const availableHeight = this.windowHeight - 400
        let width = this.windowWidth - sideSpace
        const totalHeight = width * this.bookCoverAspectRatio
        if (totalHeight > availableHeight) {
          width = availableHeight / this.bookCoverAspectRatio
        }
        return width
      } else {
        // Landscape
        const heightScale = (this.windowHeight - 200) / 651
        if (this.bookCoverAspectRatio === 1) {
          return 260 * heightScale
        }
        return 190 * heightScale
      }
    },
    showLoadingState() {
      return this.isLoading || this.isCheckingServerProgress
    },
    showCastBtn() {
      return this.$store.state.isCastAvailable
    },
    isCasting() {
      return this.mediaPlayer === 'cast-player'
    },
    mediaPlayer() {
      return this.playbackSession?.mediaPlayer || null
    },
    mediaType() {
      return this.playbackSession?.mediaType || null
    },
    isPodcast() {
      return this.mediaType === 'podcast'
    },
    mediaMetadata() {
      return this.playbackSession?.mediaMetadata || null
    },
    libraryItem() {
      return this.playbackSession?.libraryItem || null
    },
    localLibraryItem() {
      return this.playbackSession?.localLibraryItem || null
    },
    localLibraryItemCoverSrc() {
      var localItemCover = this.localLibraryItem?.coverContentUrl || null
      if (localItemCover) return Capacitor.convertFileSrc(localItemCover)
      return null
    },
    playMethod() {
      return this.playbackSession?.playMethod || 0
    },
    isLocalPlayMethod() {
      return this.playMethod == this.$constants.PlayMethod.LOCAL
    },
    isDirectPlayMethod() {
      return this.playMethod == this.$constants.PlayMethod.DIRECTPLAY
    },
    title() {
      const mediaItemTitle = this.playbackSession?.displayTitle || this.mediaMetadata?.title || 'Title'
      if (this.currentChapterTitle) {
        if (this.showFullscreen) return this.currentChapterTitle
        return `${mediaItemTitle} | ${this.currentChapterTitle}`
      }
      return mediaItemTitle
    },
    authorName() {
      if (this.playbackSession) return this.playbackSession.displayAuthor
      return this.mediaMetadata?.authorName || 'Author'
    },
    chapters() {
      return this.playbackSession?.chapters || []
    },
    // 1. 增强版当前章节：解决边界判定问题
    currentChapter() {
      if (!this.chapters || !this.chapters.length) return null
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      // 增加 0.5s 的向前容错，确保在章节末尾时，currentChapter 依然指向当前章
      return this.chapters.find((ch) => {
        const start = Number(ch.start)
        const end = Number(ch.end)
        return time >= (start - 0.5) && time < end
      }) || this.chapters[0]
    },
    // 2. 增强版下一章查找：用于触发片尾跳过后的连续定位
    nextChapter() {
      if (!this.chapters || !this.chapters.length) return null
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      // 查找第一个开始时间大于当前时间（+1秒偏移）的章节
      return this.chapters.find((c) => Number(c.start) > (time + 1))
    },
    previousChapter() {
      if (!this.chapters || !this.chapters.length) return null
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      // 倒序查找第一个开始时间小于当前时间的章节
      return [...this.chapters].reverse().find((c) => Number(c.start) < time - 1) // -1s 缓冲
    },
    currentChapterTitle() {
      return this.currentChapter?.title || ''
    },
    currentChapterDuration() {
      if (this.currentChapter) {
        return Number(this.currentChapter.end) - Number(this.currentChapter.start)
      }
      return this.totalDuration
    },
    // 进度条百分比计算 (用于 UI 渲染)
    chapterProgressPercent() {
      if (!this.currentChapter || !this.currentChapterDuration) return 0
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      const elapsed = Math.max(0, time - this.currentChapter.start)
      return Math.min(100, (elapsed / this.currentChapterDuration) * 100)
    },
    totalProgressPercent() {
      if (!this.totalDuration) return 0
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      return Math.min(100, (time / this.totalDuration) * 100)
    },
    // 时间显示逻辑重构
    currentTimePretty() {
      let time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      if (this.playerSettings.scaleElapsedTimeBySpeed && this.currentPlaybackRate > 0) {
        time = time / this.currentPlaybackRate
      }
      return this.$secondsToTimestamp(time)
    },
    totalDurationPretty() {
      return this.$secondsToTimestamp(this.totalDuration)
    },
    currentTimePretty() {
      let currentTimeToUse = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      if (this.playerSettings.scaleElapsedTimeBySpeed) {
        currentTimeToUse = currentTimeToUse / this.currentPlaybackRate
      }
      return this.$secondsToTimestamp(currentTimeToUse)
    },
    timeRemaining() {
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      // 章节模式下的剩余时间
      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        const remaining = Number(this.currentChapter.end) - time
        return remaining / (this.playerSettings.scaleElapsedTimeBySpeed ? this.currentPlaybackRate : 1)
      }
      // 总时长模式下的剩余时间
      return (this.totalDuration - time) / (this.playerSettings.scaleElapsedTimeBySpeed ? this.currentPlaybackRate : 1)
    },
    totalTimeRemaining() {
      let currentTimeToUse = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      return (this.totalDuration - currentTimeToUse) / this.currentPlaybackRate
    },
    totalTimeRemainingPretty() {
      if (this.totalTimeRemaining < 0) {
        return this.$secondsToTimestamp(this.totalTimeRemaining * -1)
      }
      return '-' + this.$secondsToTimestamp(this.totalTimeRemaining)
    },
    timeRemainingPretty() {
      const remaining = this.timeRemaining
      const sign = remaining > 0 ? '-' : ''
      return sign + this.$secondsToTimestamp(Math.abs(remaining))
    },
    sleepTimeRemainingPretty() {
      if (!this.sleepTimeRemaining) return '0s'
      var secondsRemaining = Math.round(this.sleepTimeRemaining)
      if (secondsRemaining > 91) {
        return Math.ceil(secondsRemaining / 60) + 'm'
      } else {
        return secondsRemaining + 's'
      }
    },
    socketConnected() {
      return this.$store.state.socketConnected
    },
    mediaId() {
      if (this.isPodcast || !this.playbackSession) return null
      if (this.playbackSession.libraryItemId) {
        return this.playbackSession.episodeId ? `${this.playbackSession.libraryItemId}-${this.playbackSession.episodeId}` : this.playbackSession.libraryItemId
      }
      const localLibraryItem = this.playbackSession.localLibraryItem
      if (!localLibraryItem) return null

      return this.playbackSession.localEpisodeId ? `${localLibraryItem.id}-${this.playbackSession.localEpisodeId}` : localLibraryItem.id
    }
  },
  methods: {
    showSyncsFailedDialog() {
      Dialog.alert({
        title: this.$strings.HeaderProgressSyncFailed,
        message: this.$strings.MessageProgressSyncFailed,
        cancelText: this.$strings.ButtonOk
      })
    },
    clickChaptersBtn() {
      if (!this.chapters.length) return
      this.showChapterModal = true
    },
    async coverImageLoaded(fullCoverUrl) {
      if (!fullCoverUrl) return
      const avg = await getAverageColorFromCoverUrl(this, fullCoverUrl)
      if (!avg) {
        this.coverRgb = 'rgb(55, 56, 56)'
        this.coverBgIsLight = false
      } else {
        this.coverRgb = avg.rgba
        this.coverBgIsLight = avg.isLight
      }
    },
    clickTitleAndAuthor() {
      if (!this.showFullscreen) return
      const llid = this.serverLibraryItemId || this.libraryItem?.id || this.localLibraryItem?.id
      if (llid) {
        this.$router.push(`/item/${llid}`)
        this.showFullscreen = false
      }
    },
    async selectChapter(chapter) {
      await this.$hapticsImpact()
      this.seek(chapter.start)
      this.showChapterModal = false
    },
    async castClick() {
      await this.$hapticsImpact()
      if (this.isLocalPlayMethod) {
        this.$eventBus.$emit('cast-local-item')
        return
      }
      AbsAudioPlayer.requestSession()
    },
    clickContainer() {
      this.expandToFullscreen()
    },
    expandToFullscreen() {
      this.showFullscreen = true
      if (this.titleMarquee) this.titleMarquee.reset()

      // Update track for total time bar if useChapterTrack is set
      this.$nextTick(() => {
        this.updateTrack()
      })
    },
    collapseFullscreen() {
      this.showFullscreen = false
      if (this.titleMarquee) this.titleMarquee.reset()

      this.forceCloseDropdownMenu()
    },
    async jumpNextChapter() {
      await this.$hapticsImpact()
      if (this.showLoadingState || this.seekLoading) return

      if (this.nextChapter) {
        console.log(`[Player] 跳转到下一章: ${this.nextChapter.title}`)
        this.seek(Number(this.nextChapter.start))
      } else {
        // 如果没有下一章，跳转到总时长的末尾前 0.5s，触发自然切集
        console.log(`[Player] 无下章，跳转到文件末尾`)
        this.seek(this.totalDuration - 0.5)
      }
    },
    async jumpChapterStart() {
      await this.$hapticsImpact()
      if (this.showLoadingState || this.seekLoading) return

      const time = this.currentTime
      const chapter = this.currentChapter

      if (!chapter) {
        return this.restart()
      }

      // 如果当前章节已播放超过 3 秒，回到本章开头；否则回到上一章
      const progressInChapter = time - Number(chapter.start)
      if (progressInChapter > 3) {
        this.seek(Number(chapter.start))
      } else {
        // 查找上一章
        const currentIndex = this.chapters.findIndex(c => c.start === chapter.start)
        if (currentIndex > 0) {
          this.seek(Number(this.chapters[currentIndex - 1].start))
        } else {
          this.restart()
        }
      }
    },
    showSleepTimerModal() {
      this.$emit('showSleepTimer')
    },
    async setPlaybackSpeed(speed) {
      console.log(`[AudioPlayer] Set Playback Rate: ${speed}`)
      this.currentPlaybackRate = speed
      this.updateTimestamp()
      AbsAudioPlayer.setPlaybackSpeed({ value: speed })
    },
    restart() {
      this.seek(0)
    },
    async jumpBackwards() {
      await this.$hapticsImpact()
      if (this.showLoadingState) return
      AbsAudioPlayer.seekBackward({ value: this.jumpBackwardsTime })
    },
    async jumpForward() {
      await this.$hapticsImpact()
      if (this.showLoadingState) return
      AbsAudioPlayer.seekForward({ value: this.jumpForwardTime })
    },
    setStreamReady() {
      this.readyTrackWidth = this.trackWidth
      this.updateReadyTrack()
    },
    setChunksReady(chunks, numSegments) {
      let largestSeg = 0
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (typeof chunk === 'string') {
          const chunkRange = chunk.split('-').map((c) => Number(c))
          if (chunkRange.length < 2) continue
          if (chunkRange[1] > largestSeg) largestSeg = chunkRange[1]
        } else if (chunk > largestSeg) {
          largestSeg = chunk
        }
      }
      const percentageReady = largestSeg / numSegments
      const widthReady = Math.round(this.trackWidth * percentageReady)
      if (this.readyTrackWidth === widthReady) {
        return
      }
      this.readyTrackWidth = widthReady
      this.updateReadyTrack()
    },
    updateReadyTrack() {
      if (this.playerSettings.useChapterTrack) {
        if (this.$refs.totalReadyTrack) {
          this.$refs.totalReadyTrack.style.width = this.readyTrackWidth + 'px'
        }
        this.$refs.readyTrack.style.width = this.trackWidth + 'px'
      } else {
        this.$refs.readyTrack.style.width = this.readyTrackWidth + 'px'
      }
    },
    updateTimestamp() {
      const ts = this.$refs.currentTimestamp
      if (!ts) {
        console.error('No timestamp el')
        return
      }

      let currentTime = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime
      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        currentTime = Math.max(0, currentTime - this.currentChapter.start)
      }
      if (this.playerSettings.scaleElapsedTimeBySpeed) {
        currentTime = currentTime / this.currentPlaybackRate
      }

      ts.innerText = this.$secondsToTimestamp(currentTime)
    },
    checkAutoSkip() {
      if (this.isDraggingCursor || !this.totalDuration || !this.isPlaying) return

      const chapter = this.currentChapter
      if (!chapter) return

      const chapterStart = Number(chapter.start)
      const chapterEnd = Number(chapter.end)
      const chapterId = chapter.id || chapter.title || chapter.start

      // 1. 章节切换检测
      if (this.currentActiveChapterId !== chapterId) {
        this.currentActiveChapterId = chapterId
        this.hasSkippedIntro = false
        this.hasSkippedEnding = false
      }

      const { autoSkipIntro, autoSkipEnding, skipIntroSec, skipEndingSec } = this.skipSettings
      const relativeTime = this.currentTime - chapterStart

      // 2. 自动跳过片头 (相对当前章节开头)
      if (autoSkipIntro && !this.hasSkippedIntro && skipIntroSec > 0) {
        if (relativeTime >= -0.5 && relativeTime < skipIntroSec) {
          // 只有章节足够长时才跳
          if ((chapterEnd - chapterStart) > (skipIntroSec + 5)) {
            const seekTo = chapterStart + skipIntroSec
            console.log(`[AutoSkip] 执行跳过片头: ${chapterId}, 跳转至: ${seekTo}`)
            this.hasSkippedIntro = true
            this.seek(seekTo, true)
            return
          }
        } else if (relativeTime >= skipIntroSec + 1) {
          this.hasSkippedIntro = true
        }
      }

      // 3. 自动跳过片尾 (相对当前章节结束)
      if (autoSkipEnding && !this.hasSkippedEnding && skipEndingSec > 0) {
        const skipThreshold = chapterEnd - skipEndingSec

        // 判定：进入片尾区域
        if (this.currentTime >= skipThreshold && this.currentTime < chapterEnd - 1) {
          // 确保本章节有足够的长度进行跳过
          if ((chapterEnd - chapterStart) > (skipEndingSec + 5)) {
            console.log(`[AutoSkip] 触发片尾跳过: ${chapterId}`)
            this.hasSkippedEnding = true

            if (this.nextChapter) {
              // A. 如果是在同一个音频文件内的章节切换
              const nextStart = Number(this.nextChapter.start)
              console.log(`[AutoSkip] 同文件，跳转到下一章起始: ${nextStart}`)
              this.seek(nextStart, true)
            } else {
              // B. 如果是单集文件的最后，跳转到结尾前 0.5s，让播放器自然触发下一集加载
              console.log(`[AutoSkip] 集末尾，跳转至结尾切集`)
              this.seek(this.totalDuration - 0.5, true)
            }
          }
        }
      }
    },
    timeupdate() {
      if (!this.$refs.playedTrack) return      // timeupdate 由底层驱动，可能频率极高，这里只处理 UI 状态同步
      this.$emit('updateTime', this.currentTime)

      if (this.seekLoading) {
        // 如果跳转已完成（位置接近），则取消 loading 状态
        if (Math.abs(this.currentTime - this.seekedTime) < 1.5) {
          this.seekLoading = false
          this.$refs.playedTrack.classList.remove('bg-yellow-300')
          this.$refs.playedTrack.classList.add('bg-gray-200')
        }
      }
    },
    updateTrack() {
      // 1. 基础数据准备
      const el = this.$refs.track
      if (el) {
        this.trackWidth = el.clientWidth
      }
      if (!this.trackWidth) return

      // 获取当前要显示的时间（如果是拖动中，则使用拖动的时间）
      const currentTimeToUse = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime

      // 2. 计算“总进度”百分比 (0-1)
      const totalPercentDone = Math.min(1, currentTimeToUse / this.totalDuration)
      const totalBufferedPercent = Math.min(1, this.bufferedTime / this.totalDuration)

      // 3. 计算“当前显示轨道”的百分比 (根据是否是章节模式切换)
      let displayPercentDone = totalPercentDone
      let displayBufferedPercent = totalBufferedPercent

      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        // 章节模式下的百分比计算
        const chapterStart = Number(this.currentChapter.start)
        const chapterDur = this.currentChapterDuration

        // 当前章节已播放比例
        displayPercentDone = Math.max(0, Math.min(1, (currentTimeToUse - chapterStart) / chapterDur))
        // 当前章节已缓冲比例
        displayBufferedPercent = Math.max(0, Math.min(1, (this.bufferedTime - chapterStart) / chapterDur))
      }

      // 4. 更新 DOM 样式
      const ptWidth = Math.round(displayPercentDone * this.trackWidth)

      // 主轨道：已播放
      if (this.$refs.playedTrack) {
        this.$refs.playedTrack.style.width = ptWidth + 'px'
      }
      // 主轨道：缓冲区
      if (this.$refs.bufferedTrack) {
        this.$refs.bufferedTrack.style.width = Math.round(displayBufferedPercent * this.trackWidth) + 'px'
      }
      // 游标位置
      if (this.$refs.trackCursor) {
        // 14 是游标自身宽度的一半，保证居中
        this.$refs.trackCursor.style.left = (ptWidth - 14) + 'px'
      }

      // 5. 如果开启了章节模式，还需要更新底部的“全书总进度条”
      if (this.playerSettings.useChapterTrack) {
        if (this.$refs.totalPlayedTrack) {
          this.$refs.totalPlayedTrack.style.width = Math.round(totalPercentDone * this.trackWidth) + 'px'
        }
        if (this.$refs.totalBufferedTrack) {
          this.$refs.totalBufferedTrack.style.width = Math.round(totalBufferedPercent * this.trackWidth) + 'px'
        }
      }
    },
    seek(time, force = false) {
      if (!force && (this.showLoadingState || this.seekLoading)) return
      if (this.seekLoading && Math.abs(this.seekedTime - time) < 1) return

      this.seekedTime = time
      this.seekLoading = true

      // 执行真正的跳转
      AbsAudioPlayer.seek({ value: Math.floor(time) })

      // 立即反馈 UI (无需等待系统 timeupdate)
      if (this.$refs.playedTrack) {
        const perc = time / this.totalDuration
        const ptWidth = Math.round(perc * this.trackWidth)
        this.$refs.playedTrack.style.width = ptWidth + 'px'

        // 临时变色表示“正在跳转中”
        this.$refs.playedTrack.classList.remove('bg-gray-200')
        this.$refs.playedTrack.classList.add('bg-yellow-300')
      }
    },
    async touchstartCursor(e) {
      if (!e || !e.touches || !this.$refs.track || !this.showFullscreen || this.playerSettings.lockUi) return

      await this.$hapticsImpact()
      this.isDraggingCursor = true
      this.draggingTouchStartX = e.touches[0].pageX
      this.draggingTouchStartTime = this.currentTime
      this.draggingCurrentTime = this.currentTime
      this.updateTrack()
    },
    async playPauseClick() {
      await this.$hapticsImpact()
      if (this.showLoadingState) return

      this.isPlaying = !!((await AbsAudioPlayer.playPause()) || {}).playing
      this.isEnded = false
    },
    setIsCheckingServerProgress(value) {
      this.isCheckingServerProgress = !!value
    },
    play() {
      AbsAudioPlayer.playPlayer()
      this.startPlayInterval()
      this.isPlaying = true
    },
    pause() {
      AbsAudioPlayer.pausePlayer()
      this.stopPlayInterval()
      this.isPlaying = false
    },
    startPlayInterval() {
      if (this.playInterval) clearInterval(this.playInterval)
      this.playInterval = setInterval(async () => {
        const data = await AbsAudioPlayer.getCurrentTime()
        if (!data || typeof data.value !== 'number') return

        // 批量更新数据
        const newTime = Number(data.value.toFixed(2))
        const newBuffered = Number(data.bufferedTime ? data.bufferedTime.toFixed(2) : 0)

        // 只有当时间真的发生变化时才驱动 UI 和检测
        if (Math.abs(this.currentTime - newTime) > 0.1) {
          this.currentTime = newTime
          this.bufferedTime = newBuffered

          if (this.isPlaying) {
            this.checkAutoSkip()
          }
          this.updateTimestamp()
          this.updateTrack()
        }
      }, 500)
    },
    timeupdate() {
      // 移除这里的 checkAutoSkip，全部交给 interval 处理，防止高频触发导致卡顿
      if (!this.$refs.playedTrack) return
      this.$emit('updateTime', this.currentTime)

      if (this.seekLoading) {
        // 只有在跳转模式下才处理
        if (Math.abs(this.currentTime - this.seekedTime) < 1.5) {
          this.seekLoading = false
          this.$refs.playedTrack.classList.remove('bg-yellow-300')
          this.$refs.playedTrack.classList.add('bg-gray-200')
        }
      }
    },
    stopPlayInterval() {
      clearInterval(this.playInterval)
    },
    resetStream(startTime) {
      this.closePlayback()
    },
    touchstart(e) {
      if (!e.changedTouches || this.$store.state.globals.isModalOpen) return
      const touchPosY = e.changedTouches[0].pageY
      // when minimized only listen to touchstart on the player
      if (!this.showFullscreen && touchPosY < window.innerHeight - 120) return

      // for ios
      if (!this.showFullscreen && e.pageX < 20) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }

      this.touchStartY = touchPosY
      this.touchStartTime = Date.now()
    },
    touchend(e) {
      if (!e.changedTouches) return
      const touchDuration = Date.now() - this.touchStartTime
      const touchEndY = e.changedTouches[0].pageY
      const touchDistanceY = touchEndY - this.touchStartY

      // reset touch start data
      this.touchStartTime = 0
      this.touchStartY = 0

      if (this.isDraggingCursor) {
        if (this.draggingCurrentTime !== this.currentTime) {
          this.seek(this.draggingCurrentTime)
        }
        this.isDraggingCursor = false
      } else {
        if (touchDuration > 1200) {
          // console.log('touch too long', touchDuration)
          return
        }
        if (this.showFullscreen) {
          // Touch start higher than touchend
          if (touchDistanceY > 100) {
            this.collapseFullscreen()
          }
        } else if (touchDistanceY < -100) {
          this.expandToFullscreen()
        }
      }
    },
    touchmove(e) {
      if (!this.isDraggingCursor || !e.touches) return

      const distanceMoved = e.touches[0].pageX - this.draggingTouchStartX
      let duration = this.totalDuration
      let minTime = 0
      let maxTime = duration
      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        duration = this.currentChapterDuration
        minTime = this.currentChapter.start
        maxTime = minTime + duration
      }

      const timePerPixel = duration / this.trackWidth
      const newTime = this.draggingTouchStartTime + timePerPixel * distanceMoved
      this.draggingCurrentTime = Math.min(maxTime, Math.max(minTime, newTime))

      this.updateTimestamp()
      this.updateTrack()
    },
    async clickMenuAction(action) {
      await this.$hapticsImpact()
      this.showMoreMenuDialog = false
      this.$nextTick(() => {
        if (action === 'history') {
          this.$router.push(`/media/${this.mediaId}/history?title=${this.title}`)
          this.showFullscreen = false
        } else if (action === 'scale_elapsed_time') {
          this.playerSettings.scaleElapsedTimeBySpeed = !this.playerSettings.scaleElapsedTimeBySpeed
          this.updateTimestamp()
          this.savePlayerSettings()
        } else if (action === 'lock') {
          this.playerSettings.lockUi = !this.playerSettings.lockUi
          this.savePlayerSettings()
        } else if (action === 'chapter_track') {
          this.playerSettings.useChapterTrack = !this.playerSettings.useChapterTrack
          this.playerSettings.useTotalTrack = !this.playerSettings.useChapterTrack || this.playerSettings.useTotalTrack

          this.updateTimestamp()
          this.updateTrack()
          this.updateReadyTrack()
          this.updateUseChapterTrack()
          this.savePlayerSettings()
        } else if (action === 'total_track') {
          this.playerSettings.useTotalTrack = !this.playerSettings.useTotalTrack
          this.playerSettings.useChapterTrack = !this.playerSettings.useTotalTrack || this.playerSettings.useChapterTrack

          this.updateTimestamp()
          this.updateTrack()
          this.updateReadyTrack()
          this.updateUseChapterTrack()
          this.savePlayerSettings()
        } else if (action === 'close') {
          this.closePlayback()
        }
      })
    },
    updateUseChapterTrack() {
      // Chapter track in NowPlaying only supported on iOS for now
      if (this.$platform === 'ios') {
        AbsAudioPlayer.setChapterTrack({ enabled: this.playerSettings.useChapterTrack })
      }
    },
    forceCloseDropdownMenu() {
      if (this.$refs.dropdownMenu && this.$refs.dropdownMenu.closeMenu) {
        this.$refs.dropdownMenu.closeMenu()
      }
    },
    closePlayback() {
      this.endPlayback()
      AbsAudioPlayer.closePlayback()
    },
    endPlayback() {
      this.$store.commit('setPlaybackSession', null)
      this.showFullscreen = false
      this.isEnded = false
      this.isLoading = false
      this.playbackSession = null
    },
    async loadPlayerSettings() {
      const savedPlayerSettings = await this.$localStore.getPlayerSettings()
      if (!savedPlayerSettings) {
        // In 0.9.72-beta 'useChapterTrack', 'useTotalTrack' and 'playerLock' was replaced with 'playerSettings' JSON object
        // Check if this old key was set and if so migrate them over to 'playerSettings'
        const chapterTrackPref = await this.$localStore.getPreferenceByKey('useChapterTrack')
        if (chapterTrackPref) {
          this.playerSettings.useChapterTrack = chapterTrackPref === '1'
          const totalTrackPref = await this.$localStore.getPreferenceByKey('useTotalTrack')
          this.playerSettings.useTotalTrack = totalTrackPref === '1'
          const playerLockPref = await this.$localStore.getPreferenceByKey('playerLock')
          this.playerSettings.lockUi = playerLockPref === '1'
        }
        this.savePlayerSettings()
      } else {
        this.playerSettings.useChapterTrack = !!savedPlayerSettings.useChapterTrack
        this.playerSettings.useTotalTrack = !!savedPlayerSettings.useTotalTrack
        this.playerSettings.lockUi = !!savedPlayerSettings.lockUi
        this.playerSettings.scaleElapsedTimeBySpeed = !!savedPlayerSettings.scaleElapsedTimeBySpeed
      }
    },
    savePlayerSettings() {
      return this.$localStore.setPlayerSettings({ ...this.playerSettings })
    },
    //
    // Listeners from audio AbsAudioPlayer
    //
    onPlayingUpdate(data) {
      console.log('onPlayingUpdate', JSON.stringify(data))
      this.isPlaying = !!data.value
      this.$store.commit('setPlayerPlaying', this.isPlaying)
      if (this.isPlaying) {
        this.startPlayInterval()
      } else {
        this.stopPlayInterval()
      }
    },
    onMetadata(data) {
      console.log('onMetadata', JSON.stringify(data))
      this.totalDuration = Number(data.duration.toFixed(2))
      this.currentTime = Number(data.currentTime.toFixed(2))

      // Done loading
      if (data.playerState !== 'BUFFERING' && data.playerState !== 'IDLE') {
        this.isLoading = false
      }

      if (data.playerState === 'ENDED') {
        console.log('[AudioPlayer] Playback ended')
      }
      this.isEnded = data.playerState === 'ENDED'

      this.timeupdate()
    },
    // When a playback session is started the native android/ios will send the session
    onPlaybackSession(playbackSession) {
      console.log('onPlaybackSession received', JSON.stringify(playbackSession))
      this.playbackSession = playbackSession

      this.isEnded = false
      this.isLoading = true
      this.syncStatus = 0
      this.$store.commit('setPlaybackSession', this.playbackSession)

      // 关键：开始新 Session 时重置所有自动跳过标记
      this.hasSkippedIntro = false
      this.hasSkippedEnding = false
      this.currentActiveChapterId = null

      // Set track width
      this.$nextTick(() => {
        if (this.titleMarquee) this.titleMarquee.reset()
        this.titleMarquee = new WrappingMarquee(this.$refs.titlewrapper)
        this.titleMarquee.init(this.title)

        if (this.$refs.track) {
          this.trackWidth = this.$refs.track.clientWidth
        } else {
          console.error('Track not loaded', this.$refs)
        }
      })
    },
    onPlaybackClosed() {
      this.endPlayback()
    },
    onPlaybackFailed(data) {
      console.log('Received onPlaybackFailed evt')
      var errorMessage = data.value || 'Unknown Error'
      this.$toast.error(`Playback Failed: ${errorMessage}`)
      this.endPlayback()
    },
    onPlaybackSpeedChanged(data) {
      if (!data.value || isNaN(data.value)) return
      this.currentPlaybackRate = Number(data.value)
      this.updateTimestamp()
    },
    async init() {
      await this.loadPlayerSettings()

      AbsAudioPlayer.addListener('onPlaybackSession', this.onPlaybackSession)
      AbsAudioPlayer.addListener('onPlaybackClosed', this.onPlaybackClosed)
      AbsAudioPlayer.addListener('onPlaybackFailed', this.onPlaybackFailed)
      AbsAudioPlayer.addListener('onPlayingUpdate', this.onPlayingUpdate)
      AbsAudioPlayer.addListener('onMetadata', this.onMetadata)
      AbsAudioPlayer.addListener('onProgressSyncFailing', this.showProgressSyncIsFailing)
      AbsAudioPlayer.addListener('onProgressSyncSuccess', this.showProgressSyncSuccess)
      AbsAudioPlayer.addListener('onPlaybackSpeedChanged', this.onPlaybackSpeedChanged)
    },
    async screenOrientationChange() {
      if (this.isRefreshingUI) return
      this.isRefreshingUI = true
      const windowWidth = window.innerWidth
      this.refreshUI()

      // Window width does not always change right away. Wait up to 250ms for a change.
      // iPhone 10 on iOS 16 took between 100 - 200ms to update when going from portrait to landscape
      //   but landscape to portrait was immediate
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        if (window.innerWidth !== windowWidth) {
          this.refreshUI()
          break
        }
      }

      this.isRefreshingUI = false
    },
    refreshUI() {
      this.updateScreenSize()
      if (this.$refs.track) {
        this.trackWidth = this.$refs.track.clientWidth
        this.updateTrack()
        this.updateReadyTrack()
      }
    },
    updateScreenSize() {
      setTimeout(() => {
        if (this.titleMarquee) this.titleMarquee.init(this.title)
      }, 500)

      this.windowHeight = window.innerHeight
      this.windowWidth = window.innerWidth
      const coverHeight = this.fullscreenBookCoverWidth * this.bookCoverAspectRatio
      const coverImageWidthCollapsed = 46 / this.bookCoverAspectRatio
      const titleAuthorLeftOffsetCollapsed = 30 + coverImageWidthCollapsed
      const titleAuthorWidthCollapsed = this.windowWidth - 128 - titleAuthorLeftOffsetCollapsed - 10

      document.documentElement.style.setProperty('--cover-image-width', this.fullscreenBookCoverWidth + 'px')
      document.documentElement.style.setProperty('--cover-image-height', coverHeight + 'px')
      document.documentElement.style.setProperty('--cover-image-width-collapsed', coverImageWidthCollapsed + 'px')
      document.documentElement.style.setProperty('--cover-image-height-collapsed', 46 + 'px')
      document.documentElement.style.setProperty('--title-author-left-offset-collapsed', titleAuthorLeftOffsetCollapsed + 'px')
      document.documentElement.style.setProperty('--title-author-width-collapsed', titleAuthorWidthCollapsed + 'px')
    },
    minimizePlayerEvt() {
      this.collapseFullscreen()
    },
    showProgressSyncIsFailing() {
      this.syncStatus = this.$constants.SyncStatus.FAILED
    },
    showProgressSyncSuccess() {
      this.syncStatus = this.$constants.SyncStatus.SUCCESS
    }
  },
  mounted() {
    this.updateScreenSize()
    if (screen.orientation) {
      // Not available on ios
      screen.orientation.addEventListener('change', this.screenOrientationChange)
    } else {
      document.addEventListener('orientationchange', this.screenOrientationChange)
    }
    window.addEventListener('resize', this.screenOrientationChange)

    this.$eventBus.$on('minimize-player', this.minimizePlayerEvt)
    document.body.addEventListener('touchstart', this.touchstart, { passive: false })
    document.body.addEventListener('touchend', this.touchend)
    document.body.addEventListener('touchmove', this.touchmove)
    this.$nextTick(this.init)
  },
  beforeDestroy() {
    if (screen.orientation) {
      // Not available on ios
      screen.orientation.removeEventListener('change', this.screenOrientationChange)
    } else {
      document.removeEventListener('orientationchange', this.screenOrientationChange)
    }
    window.removeEventListener('resize', this.screenOrientationChange)

    if (this.playbackSession) {
      console.log('[AudioPlayer] Before destroy closing playback')
      this.closePlayback()
    }

    this.forceCloseDropdownMenu()
    this.$eventBus.$off('minimize-player', this.minimizePlayerEvt)
    document.body.removeEventListener('touchstart', this.touchstart)
    document.body.removeEventListener('touchend', this.touchend)
    document.body.removeEventListener('touchmove', this.touchmove)

    if (AbsAudioPlayer.removeAllListeners) {
      AbsAudioPlayer.removeAllListeners()
    }
    clearInterval(this.playInterval)
  }
}
</script>

<style>
/* 样式部分保持不变 */
</style>
