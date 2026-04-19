package com.steady.wrapper.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "health_daily")
data class HealthDailyEntity(
    @PrimaryKey val date: String, // YYYY-MM-DD
    val steps: Long?,
    val sleepMinutes: Long?,
    val avgHeartRate: Long?,
    val restingHeartRate: Long?,
    val source: String = "health_connect",
    val syncedAt: String, // ISO8601 String
    val status: String = "success" // success, partial, error
)
