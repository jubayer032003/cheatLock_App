package com.jubayer.cheatlock.util

import org.junit.Assert.assertEquals
import org.junit.Test

class BackendUrlResolverTest {
    @Test
    fun normalizeForStorageAddsHttpsSchemeAndTrailingSlash() {
        assertEquals(
            "https://my-cheatlock-backend.onrender.com/",
            BackendUrlResolver.normalizeForStorage("my-cheatlock-backend.onrender.com")
        )
    }

    @Test
    fun normalizeForStorageKeepsExplicitScheme() {
        assertEquals(
            "https://my-cheatlock-backend.onrender.com/",
            BackendUrlResolver.normalizeForStorage("https://my-cheatlock-backend.onrender.com")
        )
    }

    @Test
    fun normalizeForStorageFallsBackToDefaultForBlankUrl() {
        assertEquals(
            "https://cheatlock-backend.onrender.com/",
            BackendUrlResolver.normalizeForStorage(" ")
        )
    }
}
