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
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed, re-scheduling health sync")
            (context.applicationContext as? SteadyApplication)?.scheduleHealthSync()
        }
    }
}
