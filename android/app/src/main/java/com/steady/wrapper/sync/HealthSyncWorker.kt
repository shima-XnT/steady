package com.steady.wrapper.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * 将来のバックグラウンド同期用 Worker (スタブ)
 */
class HealthSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        // Phase 2 or 3: 
        // 1. HealthConnectManager で昨日のデータを取得
        // 2. クラウド API または Room に保存
        // 3. 成功したら Result.success()

        return Result.success()
    }
}
