package com.steady.wrapper

import android.app.Application
import android.util.Log
import com.steady.wrapper.sync.HealthSyncWorker

/**
 * アプリケーション起動時に WorkManager を使ってバックグラウンド同期を登録する
 */
class SteadyApplication : Application() {

    companion object {
        private const val TAG = "SteadyApplication"
    }

    override fun onCreate() {
        super.onCreate()
        scheduleHealthSync()
    }

    fun scheduleHealthSync() {
        Log.d(TAG, "Scheduling background health sync")
        HealthSyncWorker.enqueuePeriodic(this)
    }
}
