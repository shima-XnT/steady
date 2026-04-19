package com.steady.wrapper.health

import android.content.Intent
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Health Connect の権限管理を行うヘルパークラス
 */
class PermissionHelper(private val activity: ComponentActivity) {

    private val healthConnectClient by lazy { HealthConnectClient.getOrCreate(activity) }
    
    // 必須読み取り権限
    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    )

    private var permissionCallback: ((Boolean) -> Unit)? = null

    // 権限要求ランチャー
    private val requestPermissionActivityContract = PermissionController.createRequestPermissionResultContract()
    private val requestPermissions = activity.registerForActivityResult(requestPermissionActivityContract) { granted ->
        Log.d("PermissionHelper", "Permissions granted: ${granted.containsAll(requiredPermissions)}")
        permissionCallback?.invoke(granted.containsAll(requiredPermissions))
        permissionCallback = null
    }

    suspend fun hasAllPermissions(): Boolean {
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_AVAILABLE) {
            return false
        }
        val granted = healthConnectClient.permissionController.getGrantedPermissions()
        return granted.containsAll(requiredPermissions)
    }

    suspend fun requestPermissions(): Boolean = suspendCancellableCoroutine { continuation ->
        if (HealthConnectClient.getSdkStatus(activity) != HealthConnectClient.SDK_AVAILABLE) {
            continuation.resume(false)
            return@suspendCancellableCoroutine
        }

        permissionCallback = { success ->
            continuation.resume(success)
        }
        
        requestPermissions.launch(requiredPermissions)
    }
}
