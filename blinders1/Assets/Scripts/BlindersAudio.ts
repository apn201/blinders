/**
 * BlindersAudio - two quiet cues: mode selected, camera paused.
 * Owns: two AudioComponents on a child SceneObject of the given parent.
 * Must not: play anything else (the overlay stays quiet; the log is the record).
 */
const SFX_MODE_SELECT = requireAsset("../GeneratedSFX/ModeSelect.wav") as AudioTrackAsset
const SFX_CAMERA_PAUSE = requireAsset("../GeneratedSFX/CameraPause.wav") as AudioTrackAsset

export class BlindersAudio {
  private select: AudioComponent
  private pause: AudioComponent

  constructor(parent: SceneObject, volume: number) {
    const so = global.scene.createSceneObject("Audio")
    so.setParent(parent)
    this.select = this.make(so, SFX_MODE_SELECT, volume)
    this.pause = this.make(so, SFX_CAMERA_PAUSE, volume)
  }

  playModeSelect(): void {
    this.safePlay(this.select)
  }

  playCameraPause(): void {
    this.safePlay(this.pause)
  }

  private make(so: SceneObject, track: AudioTrackAsset, volume: number): AudioComponent {
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.volume = volume
    // Input-reactive cue: low latency (Specs default is LowPower)
    a.playbackMode = Audio.PlaybackMode.LowLatency
    return a
  }

  private safePlay(a: AudioComponent): void {
    if (!a || !a.audioTrack) return
    if (a.isPlaying()) a.stop(false)
    a.play(1)
  }
}
