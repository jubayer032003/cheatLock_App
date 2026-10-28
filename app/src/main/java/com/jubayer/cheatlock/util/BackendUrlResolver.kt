package com.jubayer.cheatlock.util

import android.os.Build
import com.jubayer.cheatlock.BuildConfig

/**
 * Resolves the backend base URL for Retrofit.
 * After deployment the backend is reachable via a public HTTPS URL, so we simply
 * return the configured URL (ensuring a trailing slash). If the URL is empty we
 * fall back to a sensible default for local debugging.
 */
object BackendUrlResolver {
    private const val DEPLOYED_URL = "https://cheatlock-backend.onrender.com/"

    /** Return the user‑provided URL (or the deployed default) – no LAN‑only mapping. */
    fun resolve(configuredUrl: String): String = normalizeForStorage(
        if (configuredUrl.isBlank()) {
            DEPLOYED_URL
        } else {
            configuredUrl
        }
    )

    /** Ensure the URL ends with a trailing slash. */
    fun normalizeForStorage(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return DEPLOYED_URL

        val withScheme = if (
            trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) {
            trimmed
        } else {
            "https://$trimmed"
        }

        return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
    }

    /** UI hint – just reports the final backend URL. */
    fun displayHint(configuredUrl: String): String {
        val resolved = resolve(configuredUrl)
        return "Backend URL: $resolved"
    }

    /** Detects if the app is running on an emulator. */
    fun isEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.orEmpty()
        val model = Build.MODEL.orEmpty()
        val manufacturer = Build.MANUFACTURER.orEmpty()
        val brand = Build.BRAND.orEmpty()
        val device = Build.DEVICE.orEmpty()
        val hardware = Build.HARDWARE.orEmpty()
        val product = Build.PRODUCT.orEmpty()

        return (brand.startsWith("generic") && device.startsWith("generic"))
                || fingerprint.startsWith("generic")
                || fingerprint.startsWith("unknown")
                || hardware.contains("goldfish")
                || hardware.contains("ranchu")
                || model.contains("google_sdk")
                || model.contains("Emulator")
                || model.contains("Android SDK built for x86")
                || manufacturer.contains("Genymotion")
                || product.contains("sdk_gphone")
                || product.contains("google_sdk")
                || product.contains("sdk")
                || product.contains("sdk_x86")
                || product.contains("vbox86p")
                || product.contains("emulator")
                || product.contains("simulator")
    }

    /** Returns candidate URLs to probe for a connection. */
    fun connectionCandidates(configuredUrl: String): List<String> {
        val list = mutableListOf<String>()
        
        // 1. User-configured custom URL (or deployed default)
        val resolved = resolve(configuredUrl)
        list.add(resolved)

        // 2. Deployed Render URL (always try this as fallback)
        if (resolved != DEPLOYED_URL) {
            list.add(DEPLOYED_URL)
        }

        // 3. BuildConfig default (in case it differs from the deployed constant)
        val buildDefault = resolve(BuildConfig.CHEATLOCK_API_BASE_URL)
        if (buildDefault != resolved && buildDefault != DEPLOYED_URL) {
            list.add(buildDefault)
        }

        // 4. Local fallbacks only useful during development on emulator/USB
        if (isEmulator()) {
            val emulatorDefault = "http://10.0.2.2:3000/"
            if (!list.contains(emulatorDefault)) {
                list.add(emulatorDefault)
            }
        }

        return list.distinct()
    }
}

