package com.steady.wrapper.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.steady.wrapper.Constants
import com.steady.wrapper.data.AppDatabase
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.repository.HealthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * バックグラウンドで Health Connect → GAS に同期する Worker
 * WorkManager の PeriodicWorkRequest で15分間隔で実行される
 */
class HealthSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "HealthSyncWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting health sync...")

        val healthManager = HealthConnectManager(applicationContext)
        if (!healthManager.isAvailable()) {
            Log.w(TAG, "Health Connect not available, skipping")
            return Result.success()
        }

        val dao = AppDatabase.getDatabase(applicationContext).healthDailyDao()
        val repository = HealthRepository(healthManager, dao)
        val today = LocalDate.now().toString()

        // 1. Health Connect からデータ取得 → Room に保存
        val fetched = repository.fetchAndSave(today)
        if (!fetched) {
            Log.w(TAG, "No data fetched from Health Connect")
            return Result.retry()
        }

        // 2. Room からデータ読み取り
        val entity = repository.getHealthData(today) ?: run {
            Log.e(TAG, "Data fetched but not found in Room")
            return Result.retry()
        }

        // 3. GAS API に POST
        return try {
            val success = postToGas(entity.date, entity.steps, entity.sleepMinutes,
                entity.sleepStartAt, entity.sleepEndAt,
                entity.napMinutes, entity.napStartAt, entity.napEndAt,
                entity.heartRateAvg, entity.restingHeartRate)
            if (success) {
                Log.d(TAG, "Successfully synced to GAS for $today")
                Result.success()
            } else {
                Log.w(TAG, "GAS POST failed, will retry")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "GAS POST exception", e)
            Result.retry()
        }
    }

    /**
     * GAS の saveHealthDaily アクションに直接 HTTP POST する
     */
    private suspend fun postToGas(
        date: String,
        steps: Long?,
        sleepMinutes: Long?,
        sleepStartAt: String?,
        sleepEndAt: String?,
        napMinutes: Long?,
        napStartAt: String?,
        napEndAt: String?,
        heartRateAvg: Long?,
        restingHeartRate: Long?
    ): Boolean = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("action", "saveHealthDaily")
            put("date", date)
            if (steps != null) put("steps", steps)
            if (sleepMinutes != null) put("sleepMinutes", sleepMinutes)
            if (sleepStartAt != null) put("sleepStartAt", sleepStartAt)
            if (sleepEndAt != null) put("sleepEndAt", sleepEndAt)
            if (napMinutes != null) put("napMinutes", napMinutes)
            if (napStartAt != null) put("napStartAt", napStartAt)
            if (napEndAt != null) put("napEndAt", napEndAt)
            if (heartRateAvg != null) put("heartRateAvg", heartRateAvg)
            if (restingHeartRate != null) put("restingHeartRate", restingHeartRate)
            put("source", "health_connect")
            put("sourceDevice", "android_bg")
            put("updatedBy", "sync_worker")
            put("updatedAt", ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
            put("fetchedAt", ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
        }

        Log.d(TAG, "POST to GAS: ${json.toString().take(200)}")

        val url = URL(Constants.GAS_API_URL)
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
            conn.doOutput = true
            conn.connectTimeout = 30000
            conn.readTimeout = 30000
            // GAS redirects - follow them
            conn.instanceFollowRedirects = true

            OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                writer.write(json.toString())
                writer.flush()
            }

            val responseCode = conn.responseCode
            if (responseCode in 200..399) {
                val response = conn.inputStream.bufferedReader().use { it.readText() }
                Log.d(TAG, "GAS response ($responseCode): ${response.take(200)}")
                val result = JSONObject(response)
                result.optString("status") == "success"
            } else {
                val error = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "Unknown"
                Log.e(TAG, "GAS error ($responseCode): ${error.take(200)}")
                false
            }
        } finally {
            conn.disconnect()
        }
    }
}
