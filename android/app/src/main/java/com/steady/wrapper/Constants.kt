package com.steady.wrapper

object Constants {
    // Development URL (Change to file:///android_asset/index.html for production)
    const val PWA_URL_DEV = "http://10.0.2.2:3000" // Emulator localhost address
    const val PWA_URL_PROD = "file:///android_asset/index.html"
    
    // Choose environment
    const val PWA_URL = PWA_URL_PROD
    
    const val BRIDGE_NAME = "SteadyBridge"
    const val ROOM_DATABASE_NAME = "steady_health_db"
}
