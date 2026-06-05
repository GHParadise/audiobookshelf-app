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

    <!-- 底部播放控制栏 -->
    <div id="playerContent"
      class="playerContainer w-full z-40 absolute bottom-0 left-0 right-0 pointer-events-auto transition-all"
      :style="{
        backgroundColor: showFullscreen ? '' : coverRgb,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)'
      }"
      @click="clickContainer">

      <!-- 迷你模式背景遮罩 -->
      <div v-if="!showFullscreen" class="w-full h-full absolute top-0 left-0 pointer-events-none" style="background: var(--gradient-minimized-audio-player)" />

      <!-- 迷你模式内容区：将标题和时间限制在固定高度内，不撑开父容器 -->
      <div v-if="!showFullscreen" class="absolute left-[92px] top-3 right-36 pointer-events-none" style="height: 48px;">
        <div ref="miniTitleWrapper" class="overflow-hidden relative h-[22px]">
          <p class="title-text-mini whitespace-nowrap text-fg text-sm font-bold leading-tight"></p>
        </div>
        <p class="text-fg text-opacity-70 font-mono text-[11px] mt-1">
          {{ currentTimePretty }} / {{ timeRemainingPretty }}
        </p>
      </div>

      <!-- 按钮主容器 (右侧区域) -->
      <div id="playerControls" class="absolute right-0 top-1 mx-auto z-10" style="max-width: 414px">
        <div class="flex items-center justify-end pr-4 h-12">
          <!-- 后退 -->
          <div v-show="!playerSettings.lockUi" class="jump-icon text-fg cursor-pointer opacity-75" @click.stop="jumpBackwards">
            <span class="material-symbols text-2xl">replay</span>
          </div>

          <!-- 播放按钮：缩小尺寸，使其紧凑 -->
          <div class="play-btn cursor-pointer shadow-sm flex items-center justify-center rounded-full text-primary mx-3 relative overflow-hidden h-11 w-11"
            :style="{ backgroundColor: coverRgb }"
            :class="{ 'animate-spin': (seekLoading && !isPlaying) }"
            @click.stop="playPauseClick">
            <div v-if="!coverBgIsLight" class="absolute top-0 left-0 w-full h-full bg-white bg-opacity-20 pointer-events-none" />
            <span v-if="!showLoadingState" class="material-symbols text-3xl fill" :class="{ 'text-white': coverRgb && !coverBgIsLight }">
              {{ (seekLoading && !isPlaying) ? 'autorenew' : (!isPlaying ? 'play_arrow' : 'pause') }}
            </span>
            <widgets-spinner-icon v-else class="h-7 w-7" />
          </div>

          <!-- 前进 -->
          <div v-show="!playerSettings.lockUi" class="jump-icon text-fg cursor-pointer opacity-75" @click.stop="jumpForward">
            <span class="material-symbols text-2xl">forward_media</span>
          </div>
        </div>
      </div>

      <!-- 进度条轨道 (最底部) -->
      <div id="playerTrack" class="absolute left-0 w-full px-6" :style="{ bottom: showFullscreen ? '25%' : '0px', paddingBottom: 'env(safe-area-inset-bottom)' }">
        <!-- 全屏下才显示独立的时间轴 -->
        <div class="flex pointer-events-none" v-if="showFullscreen">
          <p class="font-mono text-fg text-sm">{{ currentTimePretty }}</p>
          <div class="flex-grow" />
          <p class="font-mono text-fg text-sm">{{ timeRemainingPretty }}</p>
        </div>
        <div ref="track" class="h-1 w-full bg-track/30 relative rounded-full overflow-hidden" :class="{ 'animate-pulse': showLoadingState }" @click.stop>
          <div ref="readyTrack" class="h-full bg-track-buffered absolute top-0 left-0 rounded-full pointer-events-none" />
          <div ref="bufferedTrack" class="h-full bg-track absolute top-0 left-0 rounded-full pointer-events-none" />
          <div ref="playedTrack" class="h-full bg-track-cursor absolute top-0 left-0 rounded-full pointer-events-none" />
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
      miniTitleMarquee: null,
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
      if (this.miniTitleMarquee) this.miniTitleMarquee.init(val);
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
    totalDurationPretty() {
      return this.$secondsToTimestamp(this.totalDuration)
    },
    // 时间显示逻辑重构
    currentTimePretty() {
      // 确定要使用的时间点（拖拽中或当前播放中）
      let time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime

      // 如果开启了章节轨道模式，计算相对于当前章节开始的偏移量
      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        time = Math.max(0, time - Number(this.currentChapter.start))
      }

      return this.$secondsToTimestamp(time)
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
      let remaining = 0
      const time = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime

      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        // 章节模式：本章总长度 - 本章已播长度
        remaining = Number(this.currentChapter.end) - time
      } else {
        // 总时长模式：全书总长 - 已播总长
        remaining = this.totalDuration - time
      }

      const sign = remaining > 0 ? '-' : ''
      return sign + this.$secondsToTimestamp(Math.abs(remaining))
    },
    // 新增：用于显示当前章节的总时长（可选，用于 UI 展示）
    currentChapterDurationText() {
      if (this.currentChapter) {
        const dur = Number(this.currentChapter.end) - Number(this.currentChapter.start)
        return this.$secondsToTimestamp(dur)
      }
      return this.$secondsToTimestamp(this.totalDuration)
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

      // 2. 自动跳过片头
      if (autoSkipIntro && !this.hasSkippedIntro && skipIntroSec > 0) {
        if (relativeTime >= -0.5 && relativeTime < skipIntroSec) {
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

      // 3. 自动跳过片尾
      if (autoSkipEnding && !this.hasSkippedEnding && skipEndingSec > 0) {
        const skipThreshold = chapterEnd - skipEndingSec

        // 判定条件：进入片尾区域 且 还没到物理文件末尾
        if (this.currentTime >= skipThreshold && this.currentTime < chapterEnd - 0.8) {
          if ((chapterEnd - chapterStart) > (skipEndingSec + 5)) {
            console.log(`[AutoSkip] 触发片尾跳过: ${chapterId}`)
            this.hasSkippedEnding = true

            if (this.nextChapter) {
              // 情况 A: 同文件内有下一章，直接跳转到下一章起始 (会自动触发下一章片头跳过)
              const nextStart = Number(this.nextChapter.start)
              console.log(`[AutoSkip] 跳转至同文件下一章: ${nextStart}`)
              this.seek(nextStart, true)
            } else {
              // 情况 B: 已是文件末尾，跳到最后触发切集
              console.log(`[AutoSkip] 跳转至文件末尾切集`)
              this.seek(this.totalDuration - 0.5, true)
            }
          }
        }
      }
    },
    timeupdate() {
      // 1. 基础 UI 同步
      if (!this.$refs.playedTrack) return
      this.$emit('updateTime', this.currentTime)

      // 2. 处理跳转中的“转圈”状态重置
      if (this.seekLoading) {
        // 判定逻辑：只要当前时间与目标跳转时间的差距缩小到 2s 以内，或者播放器已经开始播放了
        const diff = Math.abs(this.currentTime - this.seekedTime)

        if (diff < 2 || this.isPlaying) {
          console.log('[Player] 跳转完成或已恢复播放，重置 Loading 状态')
          this.seekLoading = false

          // 恢复进度条颜色
          if (this.$refs.playedTrack) {
            this.$refs.playedTrack.classList.remove('bg-yellow-300')
            this.$refs.playedTrack.classList.add('bg-gray-200')
          }
        }
      }
    },
    updateTrack() {
      const el = this.$refs.track
      if (el) {
        this.trackWidth = el.clientWidth
      }
      if (!this.trackWidth) return

      const currentTimeToUse = this.isDraggingCursor ? this.draggingCurrentTime : this.currentTime

      // 1. 全书进度百分比 (用于底部背景或总进度)
      const totalPercentDone = Math.min(1, currentTimeToUse / this.totalDuration)
      const totalBufferedPercent = Math.min(1, this.bufferedTime / this.totalDuration)

      // 2. 当前显示轨道（当前集）的百分比
      let displayPercentDone = totalPercentDone
      let displayBufferedPercent = totalBufferedPercent

      if (this.playerSettings.useChapterTrack && this.currentChapter) {
        const chapterStart = Number(this.currentChapter.start)
        const chapterEnd = Number(this.currentChapter.end)
        const chapterDur = chapterEnd - chapterStart

        if (chapterDur > 0) {
          // 计算相对于当前章节的进度 (0 到 1 之间)
          displayPercentDone = Math.max(0, Math.min(1, (currentTimeToUse - chapterStart) / chapterDur))
          displayBufferedPercent = Math.max(0, Math.min(1, (this.bufferedTime - chapterStart) / chapterDur))
        }
      }

      // 3. 更新 DOM
      const ptWidth = Math.round(displayPercentDone * this.trackWidth)

      if (this.$refs.playedTrack) {
        this.$refs.playedTrack.style.width = ptWidth + 'px'
      }
      if (this.$refs.bufferedTrack) {
        this.$refs.bufferedTrack.style.width = Math.round(displayBufferedPercent * this.trackWidth) + 'px'
      }
      if (this.$refs.trackCursor) {
        this.$refs.trackCursor.style.left = (ptWidth - 14) + 'px'
      }

      // 4. 更新全书总进度轨道 (全屏下顶部的那个条)
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

      // 如果正在转圈但音频其实已经在播放了，点击时先尝试重置状态
      if (this.seekLoading && this.isPlaying) {
        this.seekLoading = false
      }

      if (this.isPlaying) {
        this.pause()
      } else {
        this.play()
      }
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

        const newTime = Number(data.value.toFixed(2))
        const newBuffered = Number(data.bufferedTime ? data.bufferedTime.toFixed(2) : 0)

        // --- 增加转圈保护逻辑 (保险丝) ---
        if (this.seekLoading) {
          if (!this.seekStartTimestamp) this.seekStartTimestamp = Date.now()
          // 如果转圈超过 5 秒，强制 UI 恢复正常
          if (Date.now() - this.seekStartTimestamp > 5000) {
            console.warn('[Player] Seek Loading 超时，强制重置')
            this.seekLoading = false
            this.seekStartTimestamp = null
          }
        } else {
          this.seekStartTimestamp = null
        }

        // 只有当时间发生变化时才驱动 UI
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

        // 初始化迷你标题滚动
        if (this.miniTitleMarquee) this.miniTitleMarquee.reset();
        this.miniTitleMarquee = new WrappingMarquee(this.$refs.miniTitleWrapper);
        this.miniTitleMarquee.init(this.title);

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
:root {
  --cover-image-width: 0px;
  --cover-image-height: 0px;
  --cover-image-width-collapsed: 60px;
  --cover-image-height-collapsed: 60px;
  --title-author-left-offset-collapsed: 84px;
  --title-author-width-collapsed: calc(100% - 230px);
}

.playerContainer {
  height: 108px;
}
.fullscreen .playerContainer {
  height: 200px;
}

#playerContent {
  box-shadow: 0px -8px 8px #11111155;
}
.fullscreen #playerContent {
  box-shadow: none;
}

/* 进度条 + 时间区域 - 恢复官方左右显示风格 */
#playerTrack {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: margin;
  bottom: 28px;                    /* 关键调整：抬高，让时间在进度条上方 */
  left: 0;
  right: 0;
  padding: 0 16px;
}
.fullscreen #playerTrack {
  bottom: unset;
}

#playerTrack .flex {
  margin-bottom: 6px;              /* 时间与进度条间距 */
}

#playerTrack .h-1.5,
#playerTrack [ref="track"] {
  height: 3px;
  background-color: rgba(255, 255, 255, 0.14);
}

#playerTrack .bg-track-buffered {
  background-color: rgba(255, 255, 255, 0.28);
}

#playerTrack .bg-track-cursor {
  background: linear-gradient(90deg, #ffffff, #a5b4fc);
  box-shadow: 0 0 4px rgba(165, 180, 252, 0.6);
}

/* 封面 */
.cover-wrapper {
  bottom: 32px;
  left: 16px;
  height: var(--cover-image-height-collapsed);
  width: var(--cover-image-width-collapsed);
  transition: all 0.25s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: left, bottom, width, height;
  transform-origin: left bottom;
  border-radius: 6px;
  overflow: hidden;
  z-index: 45;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
}

.total-track {
  bottom: 215px;
  left: 0;
  right: 0;
}

/* 标题区域 - 配合新高度调整 */
.title-author-texts {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: left, bottom, width, height;
  transform-origin: left bottom;

  width: var(--title-author-width-collapsed);
  bottom: 68px;
  left: var(--title-author-left-offset-collapsed);
  text-align: left;
}
.title-author-texts .title-text {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: font-size;
  font-size: 0.875rem;
  line-height: 1.35;
}
.title-author-texts .author-text {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: font-size;
  font-size: 0.73rem;
  line-height: 1.1;
  margin-top: 2px;
}

/* 控制按钮 */
#playerControls {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: width, bottom;
  width: 128px;
  padding-right: 16px;
  bottom: 22px;
}
#playerControls .jump-icon {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: font-size;
  margin: 0px 0px;
  font-size: 1.6rem;
}
#playerControls .play-btn {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: padding, margin, height, width, min-width, min-height;

  height: 40px;
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  margin: 0px 7px;
}
#playerControls .play-btn .material-symbols {
  transition: all 0.15s cubic-bezier(0.39, 0.575, 0.565, 1);
  transition-property: font-size;
  font-size: 1.5rem;
}

/* 全屏模式完全保留官方原版 */
.fullscreen .cover-wrapper {
  margin: 0 auto;
  height: var(--cover-image-height);
  width: var(--cover-image-width);
  left: calc(50% - (calc(var(--cover-image-width)) / 2));
  bottom: calc(50% + 120px - (calc(var(--cover-image-height)) / 2));
  border-radius: 16px;
  overflow: hidden;
}

.fullscreen .title-author-texts {
  bottom: calc(50% - var(--cover-image-height) / 2 + 50px);
  width: 80%;
  left: 10%;
  text-align: center;
  padding-bottom: calc(((260px - var(--cover-image-height)) / 260) * 40);
  pointer-events: auto;
}
.fullscreen .title-author-texts .title-text {
  font-size: clamp(0.8rem, calc(var(--cover-image-height) / 260 * 20), 1.3rem);
}
.fullscreen .title-author-texts .author-text {
  font-size: clamp(0.6rem, calc(var(--cover-image-height) / 260 * 16), 1rem);
}

.fullscreen #playerControls {
  width: 100%;
  padding-left: 24px;
  padding-right: 24px;
  bottom: 78px;
  left: 0;
}
.fullscreen #playerControls .jump-icon {
  font-size: 2.4rem;
}
.fullscreen #playerControls .play-btn {
  height: 65px;
  width: 65px;
  min-width: 65px;
  min-height: 65px;
}
.fullscreen #playerControls .play-btn .material-symbols {
  font-size: 2.1rem;
}
</style>
