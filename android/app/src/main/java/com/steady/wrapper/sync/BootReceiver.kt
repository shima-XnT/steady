package com.steady.wrapper.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.steady.wrapper.SteadyApplication

/**
 * 端末再起動後に WorkManager の同期スケジュールを再登録する
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Log.d("BootReceiver", "System event received, re-scheduling health sync")
            (context.applicationContext as? SteadyApplication)?.scheduleHealthSync()
            HealthSyncWorker.enqueueImmediate(context, reason = "system_event", forceUpload = false)
        }
    }
}
