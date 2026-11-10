package com.madematik.draw3d;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins are registered before the bridge starts.
        registerPlugin(DrawFilesPlugin.class);
        super.onCreate(savedInstanceState);
        // WebView, Android'in yazı boyutu ayarını (ör. 1,5×) sayfadaki bütün yazılara uygular:
        // giriş alanı, kartlar, menüler ve yardım büyür, düğme yazıları taşar (drAW ve drAW2D'deki gibi).
        // Arayüz boyutları ekran pikselinde tasarlandığı için yazı ölçeği sabit tutulur.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
