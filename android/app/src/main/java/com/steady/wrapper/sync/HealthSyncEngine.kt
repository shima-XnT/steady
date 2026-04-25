package com.steady.wrapper.sync

import android.content.Context
import android.util.Log
import com.steady.wrapper.Constants
import com.steady.wrapper.data.AppDatabase
import com.steady.wrapper.data.HealthDailyEntity
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.repository.HealthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

data class HealthSyncReport(
    val status: String,
    val reason: String,
    val fetchedCount: Int = 0,
    val postedCount: Int = 0,
    val skippedUploadCount: Int = 0,
    val fetchFailureCount: Int = 0,
    val postFailureCount: Int = 0,
    val message: String = ""
) {
    val shouldRetry: Boolean
        get() = postFailureCount > 0
}

class HealthSyncEngine(private val context: Context) {

    companion object {
        private const val TAG = "HealthSyncEngine"
        private const val PREFS_NAME = "steady_health_sync"
        private const val KEY_LAST_SUCCESS_AT = "last_success_at"
        private const val KEY_LAST_ATTEMPT_AT = "last_attempt_at"
        private const val KEY_LAST_REASON = "last_reason"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_LAST_POSTED_PREFIX = "last_posted_at_"
        private const val KEY_LAST_HASH_PREFIX = "last_payload_hash_"
        private val syncMutex = Mutex()

        fun lastSuccessfulSyncAt(context: Context): Long {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong(KEY_LAST_SUCCESS_AT, 0L)
        }

        fun lastSyncError(context: Context): String {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_LAST_ERROR, "") ?: ""
        }

        fun shouldRequestForegroundSync(context: Context, force: Boolean = false): Boolean {
            if (force) return true
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val lastAttempt = prefs.getLong(KEY_LAST_ATTEMPT_AT, 0L)
            val lastSuccess = prefs.getLong(KEY_LAST_SUCCESS_AT, 0L)
            val attemptFresh = now - lastAttempt < Constants.FOREGROUND_SYNC_DEBOUNCE_MS
            val successFresh = now - lastSuccess < Constants.FOREGROUND_SYNC_STALE_MS
            return !attemptFresh && !successFresh
        }
    }

    private val healthManager = HealthConnectManager(context)
    private val dao = AppDatabase.getDatabase(context).healthDailyDao()
    private val repository = HealthRepository(healthManager, dao)
    private val prefs by lazy { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    suspend fun syncRecentDays(
        reason: String,
        requireBackgroundPermission: Boolean,
        forceUpload: Boolean
    ): HealthSyncReport = syncMutex.withLock {
        val nowMs = System.currentTimeMillis()
        prefs.edit()
            .putLong(KEY_LAST_ATTEMPT_AT, nowMs)
            .putString(KEY_LAST_REASON, reason)
            .apply()

        if (!healthManager.isAvailable()) {
            return@withLock HealthSyncReport(
                status = "skipped",
                reason = reason,
                message = "Health Connect unavailable"
            )
        }

        if (!healthManager.hasReadPermissions()) {
            return@withLock HealthSyncReport(
                status = "skipped",
                reason = reason,
                message = "Health Connect read permissions missing"
            )
        }

        if (requireBackgroundPermission && !healthManager.hasBackgroundReadPermission()) {
            return@withLock HealthSyncReport(
                status = "skipped",
                reason = reason,
                message = "Background read permission missing"
            )
        }

        val today = LocalDate.now()
        val dates = (0L..Constants.HEALTH_SYNC_LOOKBACK_DAYS)
            .map { today.minusDays(it).toString() }
            .reversed()

        var fetchedCount = 0
        var postedCount = 0
        var skippedUploadCount = 0
        var fetchFailureCount = 0
        var postFailureCount = 0
        var lastError = ""

        dates.forEach { date ->
            val fetched = repository.fetchAndSave(date)
            if (!fetched) {
                fetchFailureCount++
                return@forEach
            }

            fetchedCount++
            val entity = repository.getHealthData(date)
            if (entity == null) {
                fetchFailureCount++
                lastError = "Fetched data missing in local cache"
                return@forEach
            }

            if (!shouldUpload(entity, forceUpload)) {
                skippedUploadCount++
                return@forEach
            }

            try {
                val success = postToGas(entity)
                if (success) {
                    postedCount++
                    markUploadSuccess(entity)
                } else {
                    postFailureCount++
                    lastError = "GAS rejected payload for $date"
                }
            } catch (error: Exception) {
                postFailureCount++
                lastError = error.message ?: "Unknown upload error"
                Log.e(TAG, "Health upload failed for $date", error)
            }
        }

        val report = when {
            postFailureCount > 0 -> HealthSyncReport(
                status = "retry",
                reason = reason,
                fetchedCount = fetchedCount,
                postedCount = postedCount,
                skippedUploadCount = skippedUploadCount,
                fetchFailureCount = fetchFailureCount,
                postFailureCount = postFailureCount,
                message = lastError.ifBlank { "Upload failed" }
            )
            fetchedCount == 0 -> HealthSyncReport(
                status = "skipped",
                reason = reason,
                fetchFailureCount = fetchFailureCount,
                message = "No health data available"
            )
            else -> HealthSyncReport(
                status = "success",
                reason = reason,
                fetchedCount = fetchedCount,
                postedCount = postedCount,
                skippedUploadCount = skippedUploadCount,
                fetchFailureCount = fetchFailureCount,
                message = if (postedCount > 0) "Synced to GAS" else "No new upload needed"
            )
        }

        prefs.edit().apply {
            if (fetchedCount > 0 && postFailureCount == 0) {
                putLong(KEY_LAST_SUCCESS_AT, System.currentTimeMillis())
                remove(KEY_LAST_ERROR)
            } else if (lastError.isNotBlank()) {
                putString(KEY_LAST_ERROR, lastError)
            }
        }.apply()

        report
    }

    private fun shouldUpload(entity: HealthDailyEntity, forceUpload: Boolean): Boolean {
        if (forceUpload) return true
        val signature = payloadSignature(entity)
        val lastHash = prefs.getString(KEY_LAST_HASH_PREFIX + entity.date, "") ?: ""
        val lastPostedAt = prefs.getLong(KEY_LAST_POSTED_PREFIX + entity.date, 0L)
        val isSamePayload = signature == lastHash
        val isFresh = System.currentTimeMillis() - lastPostedAt < Constants.HEALTH_UPLOAD_SKIP_WINDOW_MS
        return !(isSamePayload && isFresh)
    }

    private fun markUploadSuccess(entity: HealthDailyEntity) {
        prefs.edit()
            .putLong(KEY_LAST_POSTED_PREFIX + entity.date, System.currentTimeMillis())
            .putString(KEY_LAST_HASH_PREFIX + entity.date, payloadSignature(entity))
            .apply()
    }

    private fun payloadSignature(entity: HealthDailyEntity): String {
        return listOf(
            entity.date,
            entity.steps,
            entity.sleepMinutes,
            entity.sleepStartAt,
            entity.sleepEndAt,
            entity.napMinutes,
            entity.napStartAt,
            entity.napEndAt,
            entity.napSessions,
            entity.sleepSessions,
            entity.sleepSessionCount,
            entity.napCount,
            entity.sleepAnchor,
            entity.sleepSummary,
            entity.heartRateAvg,
            entity.restingHeartRate,
            entity.source
        ).joinToString("|") { it?.toString() ?: "" }
    }

    private suspend fun postToGas(entity: HealthDailyEntity): Boolean = withContext(Dispatchers.IO) {
        val now = ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        val json = JSONObject().apply {
            put("action", "saveHealthDaily")
            put("date", entity.date)
            if (entity.steps != null) put("steps", entity.steps)
            if (entity.sleepMinutes != null) put("sleepMinutes", entity.sleepMinutes)
            if (entity.sleepStartAt != null) put("sleepStartAt", entity.sleepStartAt)
            if (entity.sleepEndAt != null) put("sleepEndAt", entity.sleepEndAt)
            if (entity.napMinutes != null) put("napMinutes", entity.napMinutes)
            if (entity.napStartAt != null) put("napStartAt", entity.napStartAt)
            if (entity.napEndAt != null) put("napEndAt", entity.napEndAt)
            if (!entity.napSessions.isNullOrBlank()) put("napSessions", JSONArray(entity.napSessions))
            if (!entity.sleepSessions.isNullOrBlank()) put("sleepSessions", JSONArray(entity.sleepSessions))
            if (entity.sleepSessionCount != null) put("sleepSessionCount", entity.sleepSessionCount)
            if (entity.napCount != null) put("napCount", entity.napCount)
            if (!entity.sleepAnchor.isNullOrBlank()) put("sleepAnchor", entity.sleepAnchor)
            if (!entity.sleepSummary.isNullOrBlank()) put("sleepSummary", entity.sleepSummary)
            if (entity.heartRateAvg != null) put("heartRateAvg", entity.heartRateAvg)
            if (entity.restingHeartRate != null) put("restingHeartRate", entity.restingHeartRate)
            put("source", "health_connect")
            put("sourceDevice", "android_bg")
            put("updatedBy", "sync_worker")
            put("updatedAt", now)
            put("fetchedAt", now)
        }

        val url = URL(Constants.GAS_API_URL)
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
            conn.doOutput = true
            conn.connectTimeout = 30000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = true

            OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                writer.write(json.toString())
                writer.flush()
            }

            val responseCode = conn.responseCode
            if (responseCode !in 200..399) {
                val errorText = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "Unknown"
                Log.e(TAG, "GAS error ($responseCode): ${errorText.take(200)}")
                return@withContext false
            }

            val response = conn.inputStream.bufferedReader().use { it.readText() }
            val result = JSONObject(response)
            result.optString("status") == "success"
        } finally {
            conn.disconnect()
        }
    }
}
