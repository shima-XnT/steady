package com.steady.wrapper

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.steady.wrapper.data.AppDatabase
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.health.PermissionHelper
import com.steady.wrapper.repository.HealthRepository
import com.steady.wrapper.sync.HealthSyncEngine
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.ZonedDateTime

class MainActivity : AppCompatActivity() {

    private lateinit var healthManager: HealthConnectManager
    private lateinit var permissionHelper: PermissionHelper
    private lateinit var healthRepository: HealthRepository

    private lateinit var statusText: TextView
    private lateinit var dataText: TextView
    private lateinit var syncButton: Button
    private lateinit var permissionButton: Button

    private var foregroundSyncInFlight = false
    private var transientStatusMessage: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.text_status)
        dataText = findViewById(R.id.text_data)
        syncButton = findViewById(R.id.btn_sync_now)
        permissionButton = findViewById(R.id.btn_permission)

        healthManager = HealthConnectManager(this)
        permissionHelper = PermissionHelper(this)
        val dao = AppDatabase.getDatabase(this).healthDailyDao()
        healthRepository = HealthRepository(healthManager, dao)

        syncButton.setOnClickListener { runForegroundSync(reason = "manual_tap", forceUpload = true) }
        permissionButton.setOnClickListener { requestPermissionsAndSync() }

        updateUI()
        observeWorkers()
        requestFreshSyncIfNeeded(reason = "app_open", force = false)
    }

    override fun onResume() {
        super.onResume()
        updateUI()
        requestFreshSyncIfNeeded(reason = "resume", force = false)
    }

    private fun requestPermissionsAndSync() {
        lifecycleScope.launch {
            val granted = permissionHelper.requestPermissions()
            updateUI()
            if (granted) {
                runForegroundSync(reason = "permission_granted", forceUpload = true)
            } else {
                statusText.text = "権限がないため同期できません"
            }
        }
    }

    private fun requestFreshSyncIfNeeded(reason: String, force: Boolean) {
        lifecycleScope.launch {
            if (!healthManager.isAvailable()) return@launch
            if (!permissionHelper.hasReadPermissions()) return@launch
            if (!HealthSyncEngine.shouldRequestForegroundSync(applicationContext, force)) return@launch
            runForegroundSync(reason = reason, forceUpload = force)
        }
    }

    private fun runForegroundSync(reason: String, forceUpload: Boolean) {
        if (foregroundSyncInFlight) return
        foregroundSyncInFlight = true
        syncButton.isEnabled = false
        syncButton.text = "同期中..."
        statusText.text = "Health Connectを確認しています"

        lifecycleScope.launch {
            var statusMessage = "同期を確認してください"
            try {
                val report = HealthSyncEngine(applicationContext).syncRecentDays(
                    reason = reason,
                    requireBackgroundPermission = false,
                    forceUpload = forceUpload
                )

                statusMessage = when (report.status) {
                    "success" -> if (report.postedCount > 0) {
                        "最新データを反映しました"
                    } else {
                        "最新状態です"
                    }
                    "skipped" -> report.message.ifBlank { "同期対象がありません" }
                    "retry" -> report.message.ifBlank { "同期に失敗しました" }
                    else -> report.message.ifBlank { "同期状態を確認してください" }
                }
            } finally {
                foregroundSyncInFlight = false
                syncButton.text = "今すぐ同期"
                transientStatusMessage = statusMessage
                updateUI()
            }
        }
    }

    private fun updateUI() {
        lifecycleScope.launch {
            val available = healthManager.isAvailable()
            val hasRead = permissionHelper.hasReadPermissions()
            val hasBackground = permissionHelper.hasBackgroundReadPermission()

            val permissionStatus = when {
                !available -> "Health Connectが利用できません"
                !hasRead -> "読み取り権限が必要です"
                !hasBackground -> "前面同期は可能 / 自動同期の追加権限待ち"
                else -> "自動同期は有効です"
            }

            permissionButton.isEnabled = available && (!hasRead || !hasBackground)
            permissionButton.text = if (permissionButton.isEnabled) {
                "Health Connect権限を設定"
            } else {
                "権限設定済み"
            }
            syncButton.isEnabled = available && hasRead && !foregroundSyncInFlight

            val today = LocalDate.now().toString()
            val entity = healthRepository.getHealthData(today)
            val lastSuccessAt = HealthSyncEngine.lastSuccessfulSyncAt(applicationContext)
            val lastError = HealthSyncEngine.lastSyncError(applicationContext)

            val dataStr = if (entity != null) {
                buildString {
                    appendLine("日付: $today")
                    appendLine("歩数: ${entity.steps ?: "未取得"}")
                    appendLine("睡眠: ${formatMinutes(entity.sleepMinutes)}")
                    appendLine("就寝: ${shortDateTime(entity.sleepStartAt)}")
                    appendLine("起床: ${shortDateTime(entity.sleepEndAt)}")
                    appendLine("仮眠: ${formatMinutes(entity.napMinutes)}")
                    appendLine("仮眠詳細: ${formatNapSessions(entity.napSessions, entity.napStartAt, entity.napEndAt)}")
                    appendLine("睡眠まとめ: ${entity.sleepSummary ?: "未取得"}")
                    appendLine("平均心拍: ${entity.heartRateAvg?.let { "$it bpm" } ?: "未取得"}")
                    appendLine("安静時心拍: ${entity.restingHeartRate?.let { "$it bpm" } ?: "未取得"}")
                    appendLine("最終取得: ${shortDateTime(entity.syncedAt)}")
                    appendLine("最終反映: ${formatSyncTime(lastSuccessAt)}")
                    if (lastError.isNotBlank()) {
                        appendLine("前回エラー: $lastError")
                    }
                }
            } else {
                buildString {
                    appendLine("今日のデータはまだありません")
                    appendLine("状態: $permissionStatus")
                    appendLine("最終反映: ${formatSyncTime(lastSuccessAt)}")
                    if (lastError.isNotBlank()) {
                        appendLine("前回エラー: $lastError")
                    }
                }
            }

            if (!foregroundSyncInFlight) {
                statusText.text = transientStatusMessage ?: permissionStatus
                transientStatusMessage = null
            }
            dataText.text = dataStr
        }
    }

    private fun observeWorkers() {
        WorkManager.getInstance(this)
            .getWorkInfosByTagLiveData(Constants.SYNC_WORK_TAG)
            .observe(this) { workInfos ->
                val running = workInfos?.any { it.state == WorkInfo.State.RUNNING } == true
                val failed = workInfos?.any { it.state == WorkInfo.State.FAILED } == true
                val succeeded = workInfos?.any { it.state == WorkInfo.State.SUCCEEDED } == true

                if (!foregroundSyncInFlight) {
                    when {
                        running -> statusText.text = "バックグラウンドで同期中です"
                        failed -> statusText.text = "自動同期を再試行します"
                        succeeded -> updateUI()
                    }
                }
            }
    }

    private fun formatNapSessions(raw: String?, fallbackStart: String?, fallbackEnd: String?): String {
        if (!raw.isNullOrBlank()) {
            try {
                val array = JSONArray(raw)
                val parts = mutableListOf<String>()
                for (i in 0 until array.length()) {
                    val item = array.optJSONObject(i) ?: continue
                    val minutes = item.optLong("minutes", 0)
                    val start = shortDateTime(item.optString("startAt", ""))
                    val end = shortDateTime(item.optString("endAt", ""))
                    val duration = if (minutes > 0) formatMinutes(minutes) else ""
                    val window = if (start.isNotBlank() && end.isNotBlank()) "$start-$end" else ""
                    listOf(duration, window)
                        .filter { it.isNotBlank() }
                        .joinToString(" ")
                        .takeIf { it.isNotBlank() }
                        ?.let { parts.add(it) }
                }
                if (parts.isNotEmpty()) return parts.joinToString(" / ")
            } catch (_: Exception) {
                // Fall through to aggregate window.
            }
        }

        val start = shortDateTime(fallbackStart)
        val end = shortDateTime(fallbackEnd)
        return if (start.isNotBlank() && end.isNotBlank()) "$start-$end" else "なし"
    }

    private fun formatMinutes(minutes: Long?): String {
        if (minutes == null) return "未取得"
        val hours = minutes / 60
        val rest = minutes % 60
        return "${hours}時間${rest.toString().padStart(2, '0')}分"
    }

    private fun shortDateTime(value: String?): String {
        if (value.isNullOrBlank()) return ""
        return try {
            ZonedDateTime.parse(value)
                .format(DateTimeFormatter.ofPattern("MM/dd HH:mm"))
        } catch (_: Exception) {
            value.take(16).replace('T', ' ')
        }
    }

    private fun formatSyncTime(epochMs: Long): String {
        if (epochMs <= 0L) return "未同期"
        return Instant.ofEpochMilli(epochMs)
            .atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("MM/dd HH:mm"))
    }
}
