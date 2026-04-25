package com.steady.wrapper

object Constants {
    // GAS API endpoint for health data sync
    const val GAS_API_URL = "https://script.google.com/macros/s/AKfycbzNwWhfiS536TNOe3-sq9gipfR2hfcMpQf1PkuK-nzTQP5QYnfaijfJNJ1VKsULQRlbZA/exec"

    const val ROOM_DATABASE_NAME = "steady_health_db"

    // WorkManager
    const val SYNC_WORK_NAME = "steady_health_sync"
    const val SYNC_IMMEDIATE_WORK_NAME = "steady_health_sync_immediate"
    const val SYNC_WORK_TAG = "steady_health_sync_tag"
    const val SYNC_INTERVAL_MINUTES = 15L // Android minimum
    const val HEALTH_SYNC_LOOKBACK_DAYS = 3L
    const val FOREGROUND_SYNC_STALE_MS = 3L * 60L * 1000L
    const val FOREGROUND_SYNC_DEBOUNCE_MS = 20L * 1000L
    const val HEALTH_UPLOAD_SKIP_WINDOW_MS = 5L * 60L * 1000L
}
