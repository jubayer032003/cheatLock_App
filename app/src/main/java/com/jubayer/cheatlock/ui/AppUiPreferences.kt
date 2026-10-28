package com.jubayer.cheatlock.ui

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import java.util.Locale

enum class AppLanguage(val code: String) {
    English("en"),
    Bengali("bn");

    companion object {
        fun fromCode(code: String?): AppLanguage =
            entries.firstOrNull { it.code == code } ?: English
    }
}

enum class AppThemeMode {
    System,
    Light,
    Dark;

    companion object {
        fun fromName(name: String?): AppThemeMode =
            entries.firstOrNull { it.name == name } ?: System
    }
}

object AppUiPreferences {
    private const val PREFS_NAME = "cheatlock_ui_preferences"
    private const val KEY_LANGUAGE = "language"
    private const val KEY_THEME = "theme"

    fun getLanguage(context: Context): AppLanguage =
        AppLanguage.fromCode(context.preferences().getString(KEY_LANGUAGE, AppLanguage.English.code))

    fun setLanguage(context: Context, language: AppLanguage) {
        context.preferences().edit().putString(KEY_LANGUAGE, language.code).apply()
        applyLanguage(context, language)
    }

    fun getThemeMode(context: Context): AppThemeMode =
        AppThemeMode.fromName(context.preferences().getString(KEY_THEME, AppThemeMode.System.name))

    fun setThemeMode(context: Context, mode: AppThemeMode) {
        context.preferences().edit().putString(KEY_THEME, mode.name).apply()
    }

    fun applyLanguage(context: Context, language: AppLanguage) {
        val locale = Locale.forLanguageTag(language.code)
        Locale.setDefault(locale)
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(locale)
        configuration.setLocales(LocaleList(locale))
        context.resources.updateConfiguration(configuration, context.resources.displayMetrics)
    }

    @Composable
    fun AppThemeMode.isDarkTheme(): Boolean = when (this) {
        AppThemeMode.System -> isSystemInDarkTheme()
        AppThemeMode.Light -> false
        AppThemeMode.Dark -> true
    }

    private fun Context.preferences() =
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
