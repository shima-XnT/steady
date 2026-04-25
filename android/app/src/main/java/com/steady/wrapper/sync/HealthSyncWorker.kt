package com.steady.wrapper.sync

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.steady.wrapper.Constants
import java.util.concurrent.TimeUnit

class HealthSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "HealthSyncWorker"
        private const val INPUT_REASON = "reason"
        private const val INPUT_FORCE_UPLOAD = "force_upload"

        private fun networkConstraints(): Constraints {
            return Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        }

        fun enqueueImmediate(context: Context, reason: String, forceUpload: Boolean = false) {
            val request = OneTimeWorkRequestBuilder<HealthSyncWorker>()
                .setConstraints(networkConstraints())
                .setInputData(
                    workDataOf(
                        INPUT_REASON to reason,
                        INPUT_FORCE_UPLOAD to forceUpload
                    )
                )
                .addTag(Constants.SYNC_WORK_TAG)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                Constants.SYNC_IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }

        fun enqueuePeriodic(context: Context) {
            val syncRequest = PeriodicWorkRequestBuilder<HealthSyncWorker>(
                Constants.SYNC_INTERVAL_MINUTES,
                TimeUnit.MINUTES
            )
                .setConstraints(networkConstraints())
                .setInputData(workDataOf(INPUT_REASON to "periodic"))
                .addTag(Constants.SYNC_WORK_TAG)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                Constants.SYNC_WORK_NAME,
                androidx.work.ExistingPeriodicWorkPolicy.UPDATE,
                syncRequest
            )
        }
    }

    override suspend fun doWork(): Result {
        val reason = inputData.getString(INPUT_REASON) ?: "periodic"
        val forceUpload = inputData.getBoolean(INPUT_FORCE_UPLOAD, false)
        Log.d(TAG, "Starting health sync. reason=$reason forceUpload=$forceUpload")

        val report = HealthSyncEngine(applicationContext).syncRecentDays(
            reason = reason,
            requireBackgroundPermission = true,
            forceUpload = forceUpload
        )

        Log.d(
            TAG,
            "Health sync result: status=${report.status}, fetched=${report.fetchedCount}, posted=${report.postedCount}, skipped=${report.skippedUploadCount}, fetchFail=${report.fetchFailureCount}, postFail=${report.postFailureCount}, message=${report.message}"
        )

        return if (report.shouldRetry) {
            Result.retry()
        } else {
            Result.success()
        }
    }
}
