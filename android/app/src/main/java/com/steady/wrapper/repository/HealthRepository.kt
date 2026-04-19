package com.steady.wrapper.repository

import android.util.Log
import com.steady.wrapper.data.HealthDailyDao
import com.steady.wrapper.data.HealthDailyEntity
import com.steady.wrapper.health.HealthConnectManager
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
            val sleep = healthConnectManager.getSleepMinutes(dateStr)
            val heartRate = healthConnectManager.getAverageHeartRate(dateStr)
            val restingHr = healthConnectManager.getRestingHeartRate(dateStr)

            val status = if (steps == null && sleep == null && heartRate == null && restingHr == null) {
                "partial" // Data might just be missing for the day
            } else {
                "success"
            }

            val entity = HealthDailyEntity(
                date = dateStr,
                steps = steps,
                sleepMinutes = sleep,
                avgHeartRate = heartRate,
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
                        steps = null, sleepMinutes = null, avgHeartRate = null, restingHeartRate = null,
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
}
