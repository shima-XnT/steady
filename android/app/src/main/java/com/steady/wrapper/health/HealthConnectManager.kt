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
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

data class SleepSummary(
    val minutes: Long?,
    val startAt: String?,
    val endAt: String?,
    val napMinutes: Long? = null,
    val napStartAt: String? = null,
    val napEndAt: String? = null,
    val napSessions: List<NapSummary> = emptyList()
)

data class NapSummary(
    val minutes: Long,
    val startAt: String?,
    val endAt: String?
)

private data class SleepCandidate(
    val record: SleepSessionRecord,
    val minutes: Long,
    val startLocal: ZonedDateTime,
    val endLocal: ZonedDateTime,
    val score: Long
)

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
     * 指定された日付に紐づく主睡眠の分数を取得する。
     */
    suspend fun getSleepMinutes(dateStr: String): Long? {
         return getSleepSummary(dateStr)?.minutes
    }

    /**
     * 指定日の主睡眠を取得する。
     *
     * Health Connect には昼寝も SleepSessionRecord として入るため、単純合算すると
     * 「昼寝だけがその日の睡眠」に見えやすい。対象日の朝に終わる長めの睡眠を最優先にし、
     * それが無い場合だけ、対象日の夜に始まる長めの睡眠や最長セッションへフォールバックする。
     */
    suspend fun getSleepSummary(dateStr: String): SleepSummary? {
         if (!isAvailable()) return null
          
         try {
             val date = LocalDate.parse(dateStr)
             val zone = ZoneId.of("Asia/Tokyo")
             // 睡眠は「前夜に始まって当日朝に終わる」ことが多い。
             // 過去日の表示差も吸収するため、対象日夜開始の睡眠も候補に入れてから主睡眠を選ぶ。
             val start = date.minusDays(1).atTime(18, 0).atZone(zone)
             val end = date.plusDays(1).atTime(12, 0).atZone(zone)
              
             val response = client.readRecords(
                 ReadRecordsRequest(
                     recordType = SleepSessionRecord::class,
                     timeRangeFilter = TimeRangeFilter.between(start.toInstant(), end.toInstant())
                 )
             )
              
             if (response.records.isEmpty()) return null

             val candidates = response.records
                 .mapNotNull { buildSleepCandidate(it, date, zone) }
                 .sortedByDescending { it.score }

             val primary = candidates.firstOrNull { isMainSleepCandidate(it, date) }
             val grouped = if (primary != null) groupAdjacentNightSleep(primary, candidates) else emptyList()
             val totalMinutes = grouped.takeIf { it.isNotEmpty() }?.sumOf { it.minutes }
             val sleepStart = grouped.minOfOrNull { it.record.startTime }
             val sleepEnd = grouped.maxOfOrNull { it.record.endTime }
             val naps = candidates
                 .filter { it !in grouped && isNapCandidate(it, date) }
                 .sortedBy { it.record.startTime }
             val napMinutes = naps.takeIf { it.isNotEmpty() }?.sumOf { it.minutes }
             val napStart = naps.minOfOrNull { it.record.startTime }
             val napEnd = naps.maxOfOrNull { it.record.endTime }
             val napSessions = naps.map { nap ->
                 NapSummary(
                     minutes = nap.minutes,
                     startAt = nap.record.startTime.atZone(zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                     endAt = nap.record.endTime.atZone(zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                 )
             }

             if (totalMinutes == null && napMinutes == null) return null

             return SleepSummary(
                 minutes = totalMinutes,
                 startAt = sleepStart?.atZone(zone)?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                 endAt = sleepEnd?.atZone(zone)?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                 napMinutes = napMinutes,
                 napStartAt = napStart?.atZone(zone)?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                 napEndAt = napEnd?.atZone(zone)?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                 napSessions = napSessions
             )
         } catch (e: Exception) {
             Log.e(TAG, "Error reading sleep: \${e.message}")
             return null
         }
     }

    private fun buildSleepCandidate(
        record: SleepSessionRecord,
        targetDate: LocalDate,
        zone: ZoneId
    ): SleepCandidate? {
        val minutes = ChronoUnit.MINUTES.between(record.startTime, record.endTime)
        if (minutes <= 0) return null

        val startLocal = record.startTime.atZone(zone)
        val endLocal = record.endTime.atZone(zone)
        val startDate = startLocal.toLocalDate()
        val endDate = endLocal.toLocalDate()
        val startTime = startLocal.toLocalTime()
        val endTime = endLocal.toLocalTime()

        val looksLikeNightSleep =
            startDate != endDate ||
                startTime.isBefore(LocalTime.of(9, 0)) ||
                !startTime.isBefore(LocalTime.of(18, 0))
        val wakesOnTargetMorning =
            looksLikeNightSleep &&
                endDate == targetDate &&
                isTimeBetween(endTime, LocalTime.of(3, 0), LocalTime.of(14, 0))
        val startsOnTargetNight =
            startDate == targetDate && !startTime.isBefore(LocalTime.of(18, 0))
        val spansNightAroundTarget =
            startDate != endDate && (startDate == targetDate || endDate == targetDate)
        val daytimeNap =
            startDate == endDate &&
                !startTime.isBefore(LocalTime.of(9, 0)) &&
                !endTime.isAfter(LocalTime.of(19, 0))

        var score = minutes
        if (wakesOnTargetMorning) score += 30000
        if (startsOnTargetNight) score += 15000
        if (spansNightAroundTarget) score += 8000
        if (minutes >= 180) score += 5000 else score -= 12000
        if (daytimeNap) score -= 7000

        return SleepCandidate(record, minutes, startLocal, endLocal, score)
    }

    private fun isMainSleepCandidate(candidate: SleepCandidate, targetDate: LocalDate): Boolean {
        if (candidate.minutes < 180) return false

        val startDate = candidate.startLocal.toLocalDate()
        val endDate = candidate.endLocal.toLocalDate()
        val startTime = candidate.startLocal.toLocalTime()
        val endTime = candidate.endLocal.toLocalTime()
        val spansNight = startDate != endDate && (startDate == targetDate || endDate == targetDate)
        val wakesOnTargetMorning =
            endDate == targetDate &&
                isTimeBetween(endTime, LocalTime.of(3, 0), LocalTime.of(14, 0)) &&
                (spansNight || startTime.isBefore(LocalTime.of(9, 0)) || !startTime.isBefore(LocalTime.of(18, 0)))
        val startsOnTargetNight = startDate == targetDate && !startTime.isBefore(LocalTime.of(18, 0))

        return wakesOnTargetMorning || startsOnTargetNight || spansNight
    }

    private fun isNapCandidate(candidate: SleepCandidate, targetDate: LocalDate): Boolean {
        val startDate = candidate.startLocal.toLocalDate()
        val endDate = candidate.endLocal.toLocalDate()
        val startTime = candidate.startLocal.toLocalTime()
        val endTime = candidate.endLocal.toLocalTime()
        val touchesTargetDate = startDate == targetDate || endDate == targetDate
        if (!touchesTargetDate || candidate.minutes < 10) return false

        val sameDayDaytime =
            startDate == endDate &&
                !startTime.isBefore(LocalTime.of(9, 0)) &&
                !endTime.isAfter(LocalTime.of(20, 0))
        val shortRest = candidate.minutes <= 180
        val likelyNextNightSleep = !startTime.isBefore(LocalTime.of(18, 0)) && candidate.minutes > 120

        return (sameDayDaytime || shortRest) && !likelyNextNightSleep
    }

    private fun groupAdjacentNightSleep(
        primary: SleepCandidate,
        candidates: List<SleepCandidate>
    ): List<SleepCandidate> {
        val grouped = mutableListOf(primary)
        val maxGapMinutes = 90L

        candidates.forEach { candidate ->
            if (candidate == primary) return@forEach
            if (candidate.minutes < 20) return@forEach

            val gapBefore = ChronoUnit.MINUTES.between(candidate.record.endTime, primary.record.startTime)
            val gapAfter = ChronoUnit.MINUTES.between(primary.record.endTime, candidate.record.startTime)
            val nearPrimary =
                (gapBefore in 0..maxGapMinutes) ||
                (gapAfter in 0..maxGapMinutes) ||
                recordsOverlap(candidate, primary)

            val nightLike =
                candidate.endLocal.toLocalTime().isBefore(LocalTime.of(14, 0)) ||
                !candidate.startLocal.toLocalTime().isBefore(LocalTime.of(18, 0)) ||
                candidate.startLocal.toLocalDate() != candidate.endLocal.toLocalDate()

            if (nearPrimary && nightLike) {
                grouped.add(candidate)
            }
        }

        return grouped.sortedBy { it.record.startTime }
    }

    private fun recordsOverlap(a: SleepCandidate, b: SleepCandidate): Boolean {
        return a.record.startTime < b.record.endTime && b.record.startTime < a.record.endTime
    }

    private fun isTimeBetween(time: LocalTime, start: LocalTime, end: LocalTime): Boolean {
        return !time.isBefore(start) && !time.isAfter(end)
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
