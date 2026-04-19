package com.steady.wrapper

import android.app.Application
import android.util.Log
import androidx.work.*
import com.steady.wrapper.sync.HealthSyncWorker
import java.util.concurrent.TimeUnit

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
        Log.d(TAG, "Scheduling periodic health sync every ${Constants.SYNC_INTERVAL_MINUTES} min")

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<HealthSyncWorker>(
            Constants.SYNC_INTERVAL_MINUTES, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            Constants.SYNC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )

        Log.d(TAG, "Health sync scheduled")
    }
}
