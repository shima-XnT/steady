package com.steady.wrapper.health

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/**
 * Health Connectへの実際のアクセスを行うマネージャークラス
 */
class HealthConnectManager(private val context: Context) {
    
    private val TAG = "HealthConnectManager"
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    fun isAvailable(): Boolean {
        return HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
    }

    /**
     * 指定された日付の歩数を取得する (Aggregate)
     */
    suspend fun getSteps(dateStr: String): Long? {
        if (!isAvailable()) return null
        
        try {
            val (start, end) = getDayStartAndEnd(dateStr)
            val response = client.aggregate(
                AggregateRequest(
                    metrics = setOf(StepsRecord.COUNT_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start.toInstant(), end.toInstant())
                )
            )
            return response[StepsRecord.COUNT_TOTAL]
        } catch (e: Exception) {
            Log.e(TAG, "Error reading steps: \${e.message}")
            return null
        }
    }

    /**
     * 指定された日付に終わる睡眠セッションの合計分数を取得する
     */
    suspend fun getSleepMinutes(dateStr: String): Long? {
         if (!isAvailable()) return null
         
         try {
             // 睡眠は前日の夜〜当日にかけて記録されることが多いため、前日昼12時から当日昼12時をターゲットにする
             val date = LocalDate.parse(dateStr)
             val zone = ZoneId.of("Asia/Tokyo")
             val start = date.minusDays(1).atTime(12, 0).atZone(zone)
             val end = date.atTime(12, 0).atZone(zone)
             
             val response = client.readRecords(
                 ReadRecordsRequest(
                     recordType = SleepSessionRecord::class,
                     timeRangeFilter = TimeRangeFilter.between(start.toInstant(), end.toInstant())
                 )
             )
             
             if (response.records.isEmpty()) return null
             
             var totalMinutes = 0L
             response.records.forEach { record ->
                 totalMinutes += ChronoUnit.MINUTES.between(record.startTime, record.endTime)
             }
             return totalMinutes
         } catch (e: Exception) {
             Log.e(TAG, "Error reading sleep: \${e.message}")
             return null
         }
    }

    /**
     * 指定された日付の平均心拍数を取得する (一日の全ての心拍レコードを見て平均を出すか、集計を使う)
     */
    suspend fun getAverageHeartRate(dateStr: String): Long? {
        if (!isAvailable()) return null
        
        try {
            val (start, end) = getDayStartAndEnd(dateStr)
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(start.toInstant(), end.toInstant())
                )
            )
            
            if (response.records.isEmpty()) return null
            
            var total = 0L
            var count = 0
            response.records.forEach { record ->
                record.samples.forEach { sample ->
                    total += sample.beatsPerMinute
                    count++
                }
            }
            if (count == 0) return null
            return total / count
        } catch (e: Exception) {
            Log.e(TAG, "Error reading heart rate: \${e.message}")
            return null
        }
    }

    /**
     * 指定された日付の安静時心拍数を取得する
     */
    suspend fun getRestingHeartRate(dateStr: String): Long? {
        if (!isAvailable()) return null
        
        try {
            val (start, end) = getDayStartAndEnd(dateStr)
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = RestingHeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(start.toInstant(), end.toInstant())
                )
            )
            
            if (response.records.isEmpty()) return null
            
            // 最も新しい(あるいは古い)レコードの値を採用する。簡易的に平均化
            var total = 0L
            response.records.forEach { record ->
                total += record.beatsPerMinute
            }
            return total / response.records.size
        } catch (e: Exception) {
            Log.e(TAG, "Error reading resting HR: \${e.message}")
            return null
        }
    }

    // ヘルパー: 日付文字列(YYYY-MM-DD)からその日のStartとEndをZonedDateTimeで返す
    private fun getDayStartAndEnd(dateStr: String): Pair<ZonedDateTime, ZonedDateTime> {
        val date = LocalDate.parse(dateStr)
        val zone = ZoneId.of("Asia/Tokyo")
        val start = date.atStartOfDay(zone)
        val end = date.plusDays(1).atStartOfDay(zone)
        return Pair(start, end)
    }
}
