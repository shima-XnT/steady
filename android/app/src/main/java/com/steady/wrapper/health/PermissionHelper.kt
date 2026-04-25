package com.steady.wrapper.health

import android.content.Intent
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Health Connect の権限管理を行うヘルパークラス
 */
class PermissionHelper(private val activity: ComponentActivity) {

    private val healthConnectClient by lazy { HealthConnectClient.getOrCreate(activity) }
    
    // 必須読み取り権限
    private val readPermissions = HealthPermissionRegistry.readPermissions
    private val requestedPermissions = HealthPermissionRegistry.requestedPermissions(includeBackground = true)
    private val backgroundPermissions = HealthPermissionRegistry.backgroundReadPermissions

    private var permissionCallback: ((Boolean) -> Unit)? = null

    // 権限要求ランチャー
    private val requestPermissionActivityContract = PermissionController.createRequestPermissionResultContract()
    private val requestPermissions = activity.registerForActivityResult(requestPermissionActivityContract) { granted ->
        Log.d("PermissionHelper", "Permissions granted: ${granted.containsAll(requestedPermissions)}")
        permissionCallback?.invoke(granted.containsAll(readPermissions))
        permissionCallback = null
    }

    suspend fun hasReadPermissions(): Boolean {
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_AVAILABLE) {
            return false
        }
        val granted = healthConnectClient.permissionController.getGrantedPermissions()
        return granted.containsAll(readPermissions)
    }

    suspend fun hasBackgroundReadPermission(): Boolean {
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_AVAILABLE) {
            return false
        }
        val granted = healthConnectClient.permissionController.getGrantedPermissions()
        return granted.containsAll(backgroundPermissions)
    }

    suspend fun hasAllPermissions(): Boolean {
        return hasReadPermissions() && hasBackgroundReadPermission()
    }

    suspend fun requestPermissions(): Boolean = suspendCancellableCoroutine { continuation ->
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_AVAILABLE) {
            continuation.resume(false)
            return@suspendCancellableCoroutine
        }

        permissionCallback = { success ->
            continuation.resume(success)
        }
        
        requestPermissions.launch(requestedPermissions)
    }
}
