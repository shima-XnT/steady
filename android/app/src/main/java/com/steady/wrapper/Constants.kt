package com.steady.wrapper

object Constants {
    // GAS API endpoint for health data sync
    const val GAS_API_URL = "https://script.google.com/macros/s/AKfycbzNwWhfiS536TNOe3-sq9gipfR2hfcMpQf1PkuK-nzTQP5QYnfaijfJNJ1VKsULQRlbZA/exec"

    const val ROOM_DATABASE_NAME = "steady_health_db"

    // WorkManager
    const val SYNC_WORK_NAME = "steady_health_sync"
    const val SYNC_INTERVAL_MINUTES = 15L // Android minimum
}
