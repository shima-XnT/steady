package com.steady.wrapper

import android.os.Bundle
import android.util.Log
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
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class MainActivity : AppCompatActivity() {

    private lateinit var healthManager: HealthConnectManager
    private lateinit var permissionHelper: PermissionHelper
    private lateinit var healthRepository: HealthRepository

    private lateinit var statusText: TextView
    private lateinit var dataText: TextView
    private lateinit var syncButton: Button
    private lateinit var permissionButton: Button

    companion object {
        private const val TAG = "SteadySync"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Views
        statusText = findViewById(R.id.text_status)
        dataText = findViewById(R.id.text_data)
        syncButton = findViewById(R.id.btn_sync_now)
        permissionButton = findViewById(R.id.btn_permission)

        // Components
        healthManager = HealthConnectManager(this)
        permissionHelper = PermissionHelper(this)
        val dao = AppDatabase.getDatabase(this).healthDailyDao()
        healthRepository = HealthRepository(healthManager, dao)

        // Listeners
        syncButton.setOnClickListener { manualSync() }
        permissionButton.setOnClickListener {
            lifecycleScope.launch { permissionHelper.requestPermissions(); updateUI() }
        }

        // Initial state
        updateUI()
        observeWorker()
    }

    override fun onResume() {
        super.onResume()
        updateUI()
    }

    private fun updateUI() {
        lifecycleScope.launch {
            // Permission status
            val hasPerms = permissionHelper.hasAllPermissions()
            val hcAvailable = healthManager.isAvailable()

            val permStatus = when {
                !hcAvailable -> "❌ Health Connect 未インストール"
                !hasPerms -> "⚠️ 権限が未付与です"
                else -> "✅ Health Connect 接続済み"
            }
            permissionButton.isEnabled = hcAvailable && !hasPerms

            // Today's data
            val today = LocalDate.now().toString()
            val entity = healthRepository.getHealthData(today)

            val dataStr = if (entity != null) {
                buildString {
                    appendLine("📅 ${today}")
                    appendLine("🚶 歩数: ${entity.steps ?: "—"}")
                    appendLine("😴 睡眠: ${entity.sleepMinutes?.let { "${it}分 (${it/60}h${it%60}m)" } ?: "—"}")
                    appendLine("🛌 就寝: ${entity.sleepStartAt?.take(16)?.replace('T', ' ') ?: "—"}")
                    appendLine("☀️ 起床: ${entity.sleepEndAt?.take(16)?.replace('T', ' ') ?: "—"}")
                    appendLine("💤 仮眠: ${entity.napMinutes?.let { "${it}分 (${it/60}h${it%60}m)" } ?: "—"}")
                    appendLine("仮眠詳細: ${formatNapSessions(entity.napSessions, entity.napStartAt, entity.napEndAt)}")
            appendLine("💓 心拍: ${entity.heartRateAvg ?: "—"} bpm")
                    appendLine("🫀 安静時: ${entity.restingHeartRate ?: "—"} bpm")
                    appendLine("")
                    appendLine("最終取得: ${entity.syncedAt.take(19)}")
                }
            } else {
                "今日のデータはまだありません"
            }

            statusText.text = permStatus
            dataText.text = dataStr
        }
    }

    private fun manualSync() {
        syncButton.isEnabled = false
        syncButton.text = "同期中..."

        lifecycleScope.launch {
            try {
                val today = LocalDate.now().toString()

                // 1. Health Connect → Room
                val fetched = healthRepository.fetchAndSave(today)
                if (!fetched) {
                    statusText.text = "⚠️ Health Connect からデータを取得できませんでした"
                    return@launch
                }

                // 2. Room → GAS (run the worker immediately)
                val workManager = WorkManager.getInstance(applicationContext)
                val oneTimeRequest = androidx.work.OneTimeWorkRequestBuilder<com.steady.wrapper.sync.HealthSyncWorker>().build()
                workManager.enqueue(oneTimeRequest)

                statusText.text = "✅ 同期リクエストを送信しました"
            } catch (e: Exception) {
                Log.e(TAG, "Manual sync failed", e)
                statusText.text = "❌ 同期に失敗: ${e.message}"
            } finally {
                syncButton.isEnabled = true
                syncButton.text = "今すぐ同期"
                updateUI()
            }
        }
    }

    private fun observeWorker() {
        WorkManager.getInstance(this)
            .getWorkInfosForUniqueWorkLiveData(Constants.SYNC_WORK_NAME)
            .observe(this) { workInfos ->
                val info = workInfos?.firstOrNull()
                if (info != null) {
                    val stateStr = when (info.state) {
                        WorkInfo.State.RUNNING -> "🔄 同期中..."
                        WorkInfo.State.ENQUEUED -> "⏳ 次回同期待ち"
                        WorkInfo.State.SUCCEEDED -> "✅ 同期完了"
                        WorkInfo.State.FAILED -> "❌ 同期失敗"
                        else -> info.state.toString()
                    }
                    Log.d(TAG, "Worker state: $stateStr")
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
                    val start = shortTime(item.optString("startAt", ""))
                    val end = shortTime(item.optString("endAt", ""))
                    val duration = if (minutes > 0) "${minutes}分" else ""
                    val window = if (start.isNotBlank() && end.isNotBlank()) "$start-$end" else ""
                    listOf(duration, window).filter { it.isNotBlank() }.joinToString(" ").takeIf { it.isNotBlank() }?.let {
                        parts.add(it)
                    }
                }
                if (parts.isNotEmpty()) return parts.joinToString(" / ")
            } catch (_: Exception) {
                // Fall back to aggregate nap window below.
            }
        }
        val start = shortTime(fallbackStart)
        val end = shortTime(fallbackEnd)
        return if (start.isNotBlank() && end.isNotBlank()) "$start-$end" else "—"
    }

    private fun shortTime(value: String?): String {
        if (value.isNullOrBlank()) return ""
        return value.take(16).replace('T', ' ').takeLast(5)
    }
}
