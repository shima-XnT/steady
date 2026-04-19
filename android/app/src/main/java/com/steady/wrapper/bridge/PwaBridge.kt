package com.steady.wrapper.bridge

import android.app.Activity
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.health.PermissionHelper
import com.steady.wrapper.repository.HealthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * PWAとAndroidネイティブ層を繋ぐJS Bridge
 * JSからは `window.SteadyBridge.メソッド名()` で呼び出す
 */
class PwaBridge(
    private val activity: Activity,
    private val healthConnectManager: HealthConnectManager,
    private val permissionHelper: PermissionHelper,
    private val repository: HealthRepository,
    private val webView: WebView
) {
    private val scope = CoroutineScope(Dispatchers.Main)

    /**
     * 指定日付の健康データをJSON文字列で取得
     */
    @JavascriptInterface
    fun getHealthData(dateStr: String): String {
        Log.d("PwaBridge", "PWA requested health data for: $dateStr")
        // 同期的に返す必要があるが、DB操作は非同期なので、まずは最新キャッシュ(DB)を返す
        // 完全同期にする場合は RunBlocking を使うが、ANR防止のためシンプルに。
        // ここでは最新のDB内容をJSON化して返すだけにし、不足の場合は syncHealthData をPWAから呼んでもらう。
        
        var jsonResult = "{}"
        
        // This is a blocking call, use carefully. In real production, we might use callbacks.
        kotlinx.coroutines.runBlocking {
            val data = repository.getHealthData(dateStr)
            if (data != null) {
                jsonResult = """
                    {
                        "date": "${data.date}",
                        "steps": ${data.steps ?: "null"},
                        "sleepMinutes": ${data.sleepMinutes ?: "null"},
                        "heartRateAvg": ${data.avgHeartRate ?: "null"},
                        "restingHeartRate": ${data.restingHeartRate ?: "null"},
                        "source": "${data.source}",
                        "syncedAt": "${data.syncedAt}",
                        "status": "${data.status}"
                    }
                """.trimIndent()
            }
        }
        return jsonResult
    }

    /**
     * 手動同期トリガー。結果は非同期で通知。
     */
    @JavascriptInterface
    fun syncHealthData(dateStr: String) {
        scope.launch {
            Log.d("PwaBridge", "PWA triggered sync for: $dateStr")
            if (permissionHelper.hasAllPermissions()) {
                val success = repository.fetchAndSave(dateStr)
                if (success) {
                    notifyHealthDataUpdated(dateStr)
                }
            } else {
                Log.w("PwaBridge", "Cannot sync: Permission denied")
                notifyError("permission_denied")
            }
        }
    }

    /**
     * 現在の接続ステータスを取得（connected, disconnected, permission_denied, not_supported）
     */
    @JavascriptInterface
    fun getConnectionStatus(): String {
        var hasPerms = false
        kotlinx.coroutines.runBlocking {
            hasPerms = permissionHelper.hasAllPermissions()
        }
        return when {
            !healthConnectManager.isAvailable() -> "not_supported"
            !hasPerms -> "permission_denied"
            else -> "connected"
        }
    }

    /**
     * 権限要求画面を開く
     */
    @JavascriptInterface
    fun requestPermissions() {
        Log.d("PwaBridge", "PWA requested permissions")
        scope.launch {
            permissionHelper.requestPermissions()
        }
    }

    /**
     * PWA 側に更新を通知する
     */
    fun notifyHealthDataUpdated(dateStr: String) {
        scope.launch {
            webView.evaluateJavascript("if(window.App && window.App.onHealthDataUpdated) window.App.onHealthDataUpdated('$dateStr');", null)
        }
    }

    private fun notifyError(errorType: String) {
        scope.launch {
            webView.evaluateJavascript("if(window.App && window.App.onHealthBridgeError) window.App.onHealthBridgeError('$errorType');", null)
        }
    }

    /**
     * CORS制限を回避するため、ネイティブ側でHTTPリクエストを肩代わりする
     */
    @JavascriptInterface
    fun fetchUrl(urlStr: String, method: String, bodyStr: String?): String {
        Log.d("PwaBridge", "Native fetch: $method $urlStr (body=${bodyStr?.take(100)})")
        return try {
            var currentUrl = urlStr
            var currentMethod = method
            var currentBody = bodyStr
            var redirectCount = 0
            val maxRedirects = 5

            while (redirectCount < maxRedirects) {
                val url = java.net.URL(currentUrl)
                val connection = url.openConnection() as java.net.HttpURLConnection
                connection.requestMethod = currentMethod
                connection.readTimeout = 15000
                connection.connectTimeout = 10000
                connection.setRequestProperty("User-Agent", "SteadyApp/1.3")
                connection.setRequestProperty("Accept", "application/json")
                // GASのリダイレクトは手動でハンドリングする
                connection.instanceFollowRedirects = false

                if (currentMethod == "POST" && currentBody != null && currentBody.isNotEmpty()) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
                    connection.outputStream.use { os ->
                        val input = currentBody!!.toByteArray(Charsets.UTF_8)
                        os.write(input, 0, input.size)
                    }
                }

                val statusCode = connection.responseCode
                Log.d("PwaBridge", "Response status: $statusCode for $currentUrl")

                // リダイレクト処理 (301, 302, 303, 307, 308)
                if (statusCode in listOf(301, 302, 303, 307, 308)) {
                    val newUrl = connection.getHeaderField("Location")
                    if (newUrl != null) {
                        Log.d("PwaBridge", "Redirect $statusCode -> $newUrl")
                        currentUrl = newUrl
                        // 302/303 はGETに変換（GASの仕様）
                        if (statusCode == 302 || statusCode == 303) {
                            currentMethod = "GET"
                            currentBody = null
                        }
                        redirectCount++
                        connection.disconnect()
                        continue
                    }
                }

                // 正常レスポンス読み取り
                val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
                val result = stream?.bufferedReader()?.use { it.readText() } ?: "{\"status\":\"error\", \"message\":\"No response body\"}"
                connection.disconnect()
                Log.d("PwaBridge", "Response: ${result.take(200)}")
                return result
            }

            "{\"status\":\"error\", \"message\":\"Too many redirects\"}"
        } catch (e: Exception) {
            Log.e("PwaBridge", "fetchUrl error: ${e.message}", e)
            "{\"status\":\"error\", \"message\": \"${e.message?.replace("\"", "'")}\"}"
        }
    }
}
