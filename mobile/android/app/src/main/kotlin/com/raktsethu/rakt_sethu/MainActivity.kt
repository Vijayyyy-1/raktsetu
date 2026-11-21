package com.raktsethu.rakt_sethu

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // High importance so blood-request pushes pop up as heads-up alerts; id matches the manifest default channel.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel("blood_requests", "Blood requests", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Urgent requests near you that your blood group can help"
                }
            )
        }
    }
}
