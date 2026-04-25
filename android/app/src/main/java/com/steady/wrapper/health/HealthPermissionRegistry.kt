package com.steady.wrapper.health

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord

object HealthPermissionRegistry {
    val readPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    )

    val backgroundReadPermissions: Set<String> = setOf(
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
    )

    fun requestedPermissions(includeBackground: Boolean = true): Set<String> {
        return if (includeBackground) {
            readPermissions + backgroundReadPermissions
        } else {
            readPermissions
        }
    }
}
