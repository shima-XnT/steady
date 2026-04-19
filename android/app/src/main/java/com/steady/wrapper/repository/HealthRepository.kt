package com.steady.wrapper.repository

import android.util.Log
import com.steady.wrapper.data.HealthDailyDao
import com.steady.wrapper.data.HealthDailyEntity
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.health.NapSummary
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

class HealthRepository(
    private val healthConnectManager: HealthConnectManager,
    private val dao: HealthDailyDao
) {
    private val TAG = "HealthRepository"

    /**
     * Health Connect からデータを取得し、Roomに保存する。
     * @return 同期成功したかどうか
     */
    suspend fun fetchAndSave(dateStr: String): Boolean {
        if (!healthConnectManager.isAvailable()) {
            Log.w(TAG, "Health Connect is not available")
            return false
        }

        try {
            val steps = healthConnectManager.getSteps(dateStr)
            val sleepSummary = healthConnectManager.getSleepSummary(dateStr)
            val sleep = sleepSummary?.minutes
            val nap = sleepSummary?.napMinutes
            val napSessions = encodeNapSessions(sleepSummary?.napSessions.orEmpty())
            val heartRate = healthConnectManager.getAverageHeartRate(dateStr)
            val restingHr = healthConnectManager.getRestingHeartRate(dateStr)

            val status = if (steps == null && sleep == null && nap == null && heartRate == null && restingHr == null) {
                "partial" // Data might just be missing for the day
            } else {
                "success"
            }

            val entity = HealthDailyEntity(
                date = dateStr,
                steps = steps,
                sleepMinutes = sleep,
                sleepStartAt = sleepSummary?.startAt,
                sleepEndAt = sleepSummary?.endAt,
                napMinutes = nap,
                napStartAt = sleepSummary?.napStartAt,
                napEndAt = sleepSummary?.napEndAt,
                napSessions = napSessions,
                heartRateAvg = heartRate,
                restingHeartRate = restingHr,
                source = "health_connect",
                syncedAt = ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                status = status
            )

            dao.insertOrUpdate(entity)
            Log.d(TAG, "Successfully synced and saved data for $dateStr")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync data for $dateStr", e)
            val existing = dao.getByDate(dateStr)
            if (existing == null) {
                dao.insertOrUpdate(
                    HealthDailyEntity(
                        date = dateStr,
                        steps = null, sleepMinutes = null, sleepStartAt = null, sleepEndAt = null,
                        napMinutes = null, napStartAt = null, napEndAt = null, napSessions = null,
                        heartRateAvg = null, restingHeartRate = null,
                        source = "health_connect",
                        syncedAt = ZonedDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                        status = "error"
                    )
                )
            }
            return false
        }
    }

    suspend fun getHealthData(dateStr: String): HealthDailyEntity? {
        return dao.getByDate(dateStr)
    }

    private fun encodeNapSessions(sessions: List<NapSummary>): String? {
        if (sessions.isEmpty()) return null
        val array = JSONArray()
        sessions.forEach { session ->
            array.put(JSONObject().apply {
                put("minutes", session.minutes)
                put("startAt", session.startAt)
                put("endAt", session.endAt)
            })
        }
        return array.toString()
    }
}
