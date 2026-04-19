package com.steady.wrapper.health

enum class HealthConnectAvailability {
    AVAILABLE,
    NOT_INSTALLED,
    NOT_SUPPORTED,
    UPDATE_REQUIRED;

    companion object {
        fun fromSdkStatus(status: Int): HealthConnectAvailability {
            return when (status) {
                androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE -> AVAILABLE
                androidx.health.connect.client.HealthConnectClient.SDK_UNAVAILABLE -> NOT_INSTALLED
                androidx.health.connect.client.HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> UPDATE_REQUIRED
                else -> NOT_SUPPORTED
            }
        }
    }
}
