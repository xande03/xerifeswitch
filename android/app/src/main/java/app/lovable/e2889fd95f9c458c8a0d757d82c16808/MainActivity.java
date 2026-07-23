package app.lovable.e2889fd95f9c458c8a0d757d82c16808;

import android.app.PictureInPictureParams;
import android.os.Build;
import android.util.Rational;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();
        // Ensure WebView allows media playback & DOM storage (required for iframe video PiP flow).
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptEnabled(true);
    }

    // When the user leaves the app (home button / recent apps), if a video is
    // playing we auto-enter native Picture-in-Picture so playback keeps a
    // floating window on the OS.
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .build();
                enterPictureInPictureMode(params);
            } catch (Exception ignored) {
                // Some OEMs / states do not allow PiP entry; silently ignore.
            }
        }
    }
}
