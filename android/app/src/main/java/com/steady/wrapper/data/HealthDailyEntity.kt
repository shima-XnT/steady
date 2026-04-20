package com.steady.wrapper.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "health_daily")
data class HealthDailyEntity(
    @PrimaryKey val date: String, // YYYY-MM-DD
    val steps: Long?,
    val sleepMinutes: Long?,
    val sleepStartAt: String? = null,
    val sleepEndAt: String? = null,
    val napMinutes: Long? = null,
    val napStartAt: String? = null,
    val napEndAt: String? = null,
    val napSessions: String? = null,
    val sleepSessions: String? = null,
    val sleepSessionCount: Int? = null,
    val napCount: Int? = null,
    val sleepAnchor: String? = null,
    val sleepSummary: String? = null,
    val heartRateAvg: Long?,
    val restingHeartRate: Long?,
    val source: String = "health_connect",
    val syncedAt: String, // ISO8601 String
    val status: String = "success" // success, partial, error
)
