package com.steady.wrapper.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface HealthDailyDao {

    @Query("SELECT * FROM health_daily WHERE date = :date LIMIT 1")
    suspend fun getByDate(date: String): HealthDailyEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(entity: HealthDailyEntity)

    @Query("SELECT * FROM health_daily WHERE date BETWEEN :startDate AND :endDate ORDER BY date ASC")
    suspend fun getRange(startDate: String, endDate: String): List<HealthDailyEntity>

    @Query("DELETE FROM health_daily")
    suspend fun clearAll()
}
