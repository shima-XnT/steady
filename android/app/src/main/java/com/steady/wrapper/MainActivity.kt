package com.steady.wrapper

import android.os.Bundle
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.steady.wrapper.bridge.PwaBridge
import com.steady.wrapper.data.AppDatabase
import com.steady.wrapper.health.HealthConnectManager
import com.steady.wrapper.health.PermissionHelper
import com.steady.wrapper.repository.HealthRepository
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var healthConnectManager: HealthConnectManager
    private lateinit var permissionHelper: PermissionHelper
    private lateinit var healthRepository: HealthRepository
    private lateinit var pwaBridge: PwaBridge

    companion object {
        private const val TAG = "SteadyWrapper"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        // 1. Initialize Components
        healthConnectManager = HealthConnectManager(this)
        permissionHelper = PermissionHelper(this)
        val database = AppDatabase.getDatabase(this)
        healthRepository = HealthRepository(healthConnectManager, database.healthDailyDao())

        // 2. Setup WebView Bridge
        pwaBridge = PwaBridge(this, healthConnectManager, permissionHelper, healthRepository, webView)
        setupWebView()

        // 3. Load PWA
        webView.loadUrl(Constants.PWA_URL)

        // 4. Initial check & sync if permissions granted
        checkPermissionsAndSync()
    }

    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(true) // For development

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "WebView page loaded: $url")
            }
        }
        
        webView.webChromeClient = WebChromeClient()

        // Add Bridge
        webView.addJavascriptInterface(pwaBridge, Constants.BRIDGE_NAME)
    }

    private fun checkPermissionsAndSync() {
        lifecycleScope.launch {
            if (permissionHelper.hasAllPermissions()) {
                Log.d(TAG, "Permissions granted, running initial sync")
                // Today Sync
                val today = java.time.LocalDate.now().toString()
                healthRepository.fetchAndSave(today)
                // Notify PWA
                pwaBridge.notifyHealthDataUpdated(today)
            } else {
                Log.d(TAG, "Missing permissions, waiting for user to request")
            }
        }
    }
}
