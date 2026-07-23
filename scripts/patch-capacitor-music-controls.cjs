const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function patchFile(relativePath, replacements) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return;

  let source = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      console.warn(`[patch-capacitor-music-controls] Pattern not found in ${relativePath}`);
      continue;
    }
    source = source.replace(from, to);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
    console.log(`[patch-capacitor-music-controls] Patched ${relativePath}`);
  }
}

patchFile('node_modules/capacitor-music-controls-plugin/android/src/main/java/com/ingageco/capacitormusiccontrols/MusicControlsInfos.java', [
  [
`\tpublic boolean dismissable;
\tpublic String playIcon;`,
`\tpublic boolean dismissable;
\tpublic double duration;
\tpublic double elapsed;
\tpublic String playIcon;`,
  ],
  [
`\t\tthis.dismissable = params.getBoolean("dismissable");
\t\tthis.playIcon = params.getString("playIcon");`,
`\t\tthis.dismissable = params.getBoolean("dismissable");
\t\tthis.duration = params.has("duration") ? params.getDouble("duration") : 0;
\t\tthis.elapsed = params.has("elapsed") ? params.getDouble("elapsed") : 0;
\t\tthis.playIcon = params.getString("playIcon");`,
  ],
]);

patchFile('node_modules/capacitor-music-controls-plugin/android/src/main/java/com/ingageco/capacitormusiccontrols/MediaSessionCallback.java', [
  [
`  @Override
  public void onPlayFromMediaId(String mediaId, Bundle extras) {
    super.onPlayFromMediaId(mediaId, extras);
  }

  @Override
  public boolean onMediaButtonEvent(Intent mediaButtonIntent) {`,
`  @Override
  public void onPlayFromMediaId(String mediaId, Bundle extras) {
    super.onPlayFromMediaId(mediaId, extras);
  }

  @Override
  public void onSeekTo(long pos) {
    super.onSeekTo(pos);

    JSObject ret = new JSObject();
    ret.put("message", "music-controls-seek-to");
    ret.put("position", pos / 1000.0);
    this.musicControls.controlsNotification(ret);
  }

  @Override
  public boolean onMediaButtonEvent(Intent mediaButtonIntent) {`,
  ],
]);

patchFile('node_modules/capacitor-music-controls-plugin/android/src/main/java/com/ingageco/capacitormusiccontrols/CapacitorMusicControls.java', [
  [
`\t\t\tif (this.currentInfos != null) {
\t\t\t\tthis.currentInfos.isPlaying = isPlaying;
\t\t\t}
\t\t\tif (this.notification != null && this.currentInfos != null && this.currentInfos.isPlaying != isPlaying) {
\t\t\t\tthis.notification.updateIsPlaying(isPlaying);
\t\t\t}

\t\t\tif(isPlaying)`,
`\t\t\tif (this.currentInfos != null) {
\t\t\t\tthis.currentInfos.isPlaying = isPlaying;
\t\t\t}

\t\t\tif(isPlaying)`,
  ],
  [
`\tprivate android.media.session.MediaSession.Token token;
\tprivate MusicControlsServiceConnection mConnection;`,
`\tprivate android.media.session.MediaSession.Token token;
\tprivate MusicControlsServiceConnection mConnection;
\tprivate MusicControlsInfos currentInfos;
\tprivate long currentElapsedMs = 0;`,
  ],
  [
`\t\t\t\tfinal MusicControlsInfos infos = new MusicControlsInfos(options);

\t\t\t\tfinal MediaMetadataCompat.Builder metadataBuilder = new MediaMetadataCompat.Builder();`,
`\t\t\t\tfinal MusicControlsInfos infos = new MusicControlsInfos(options);
\t\t\t\tthis.currentInfos = infos;
\t\t\t\tthis.currentElapsedMs = Math.max(0, Math.round(infos.elapsed * 1000));

\t\t\t\tfinal MediaMetadataCompat.Builder metadataBuilder = new MediaMetadataCompat.Builder();`,
  ],
  [
`\t\t\t\t//album
\t\t\t\tmetadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM, infos.album);

\t\t\t\tBitmap art = getBitmapCover(infos.cover);`,
`\t\t\t\t//album
\t\t\t\tmetadataBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM, infos.album);
\t\t\t\tif (infos.duration > 0) {
\t\t\t\t\tmetadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Math.round(infos.duration * 1000));
\t\t\t\t}

\t\t\t\tBitmap art = getBitmapCover(infos.cover);`,
  ],
  [
`\t\ttry{
\t\t\tfinal boolean isPlaying = params.getBoolean("isPlaying");
\t\t\tthis.notification.updateIsPlaying(isPlaying);

\t\t\tif(isPlaying)`,
`\t\ttry{
\t\t\tfinal boolean isPlaying = params.getBoolean("isPlaying");
\t\t\tif (params.has("elapsed")) {
\t\t\t\tthis.currentElapsedMs = Math.max(0, Math.round(params.getDouble("elapsed") * 1000));
\t\t\t}
\t\t\tif (this.currentInfos != null) {
\t\t\t\tthis.currentInfos.isPlaying = isPlaying;
\t\t\t}
\t\t\tthis.notification.updateIsPlaying(isPlaying);

\t\t\tif(isPlaying)`,
  ],
  [
`\t\ttry{
\t\t\tfinal boolean isPlaying = params.getBoolean("isPlaying");
\t\t\tthis.notification.updateIsPlaying(isPlaying);

\t\t\tif(isPlaying)`,
`\t\ttry{
\t\t\tfinal boolean isPlaying = params.getBoolean("isPlaying");
\t\t\tif (params.has("elapsed")) {
\t\t\t\tthis.currentElapsedMs = Math.max(0, Math.round(params.getDouble("elapsed") * 1000));
\t\t\t}
\t\t\tif (this.currentInfos != null) {
\t\t\t\tthis.currentInfos.isPlaying = isPlaying;
\t\t\t}

\t\t\tif(isPlaying)`,
  ],
  [
`\tprivate void setMediaPlaybackState(int state) {
\t\tPlaybackStateCompat.Builder playbackstateBuilder = new PlaybackStateCompat.Builder();
\t\tif( state == PlaybackStateCompat.STATE_PLAYING ) {
\t\t\tplaybackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
\t\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
\t\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_SEARCH);
\t\t\tplaybackstateBuilder.setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
\t\t} else {
\t\t\tplaybackstateBuilder.setActions(PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
\t\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
\t\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_SEARCH);
\t\t\tplaybackstateBuilder.setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 0);
\t\t}
\t\tthis.mediaSessionCompat.setPlaybackState(playbackstateBuilder.build());
\t}`, 
`\tprivate void setMediaPlaybackState(int state) {
\t\tPlaybackStateCompat.Builder playbackstateBuilder = new PlaybackStateCompat.Builder();
\t\tlong actions = PlaybackStateCompat.ACTION_PLAY_PAUSE |
\t\t\t\tPlaybackStateCompat.ACTION_SEEK_TO |
\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID |
\t\t\t\tPlaybackStateCompat.ACTION_PLAY_FROM_SEARCH;

\t\tif( state == PlaybackStateCompat.STATE_PLAYING ) {
\t\t\tactions |= PlaybackStateCompat.ACTION_PAUSE;
\t\t} else {
\t\t\tactions |= PlaybackStateCompat.ACTION_PLAY;
\t\t}

\t\tif (this.currentInfos == null || this.currentInfos.hasNext) {
\t\t\tactions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
\t\t}
\t\tif (this.currentInfos == null || this.currentInfos.hasPrev) {
\t\t\tactions |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
\t\t}

\t\tplaybackstateBuilder.setActions(actions);
\t\tplaybackstateBuilder.setState(state, Math.max(0, this.currentElapsedMs), state == PlaybackStateCompat.STATE_PLAYING ? 1.0f : 0);
\t\tthis.mediaSessionCompat.setPlaybackState(playbackstateBuilder.build());
\t}`,
  ],
]);