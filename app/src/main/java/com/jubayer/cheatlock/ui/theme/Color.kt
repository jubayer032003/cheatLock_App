package com.jubayer.cheatlock.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * CheatLock Premium Palette — Navy Blue & Light Purple
 * Professional, clean, and advanced enterprise aesthetic.
 */

// Brand Colors
val CheatLockNavyDeep = Color(0xFF0A0F1D)    // Deepest Midnight Navy
val CheatLockNavyRich = Color(0xFF111827)    // Rich Slate Navy
val CheatLockNavySurface = Color(0xFF1F2937) // Modern Navy Surface
val CheatLockNavyBorder = Color(0xFF374151)  // Slate Navy Border

val CheatLockPurpleVibrant = Color(0xFF8B5CF6) // Primary Light Purple
val CheatLockPurpleSoft = Color(0xFFA78BFA)    // Soft Accent Purple
val CheatLockPurpleDeep = Color(0xFF6D28D9)    // Deep Royal Purple

val CheatLockWhite = Color(0xFFFFFFFF)
val CheatLockOffWhite = Color(0xFFF9FAFB)      // Clean Off-White

// Semantic Status
val CheatLockSuccess = Color(0xFF10B981)       // Emerald Green
val CheatLockWarning = Color(0xFFF59E0B)       // Amber Yellow
val CheatLockDanger = Color(0xFFEF4444)        // Modern Red
val CheatLockInfo = Color(0xFF3B82F6)          // Bright Blue

// Legacy Compatibility (mapping old names to new palette)
val CheatLockRed = CheatLockPurpleVibrant
val CheatLockRedSoft = CheatLockPurpleSoft
val CheatLockRedDeep = CheatLockPurpleDeep
val CheatLockRedGlow = CheatLockPurpleVibrant.copy(alpha = 0.15f)

val CheatLockGray950 = CheatLockNavyDeep
val CheatLockGray900 = CheatLockNavyRich
val CheatLockGray800 = CheatLockNavySurface
val CheatLockGray700 = Color(0xFF374151)
val CheatLockGray600 = Color(0xFF4B5563)
val CheatLockGray500 = Color(0xFF6B7280)
val CheatLockGray400 = Color(0xFF9CA3AF)
val CheatLockGray300 = Color(0xFFD1D5DB)

// Layout Aliases
val CheatLockDarkBackground = CheatLockNavyDeep
val CheatLockDarkSurface = CheatLockNavyRich
val CheatLockDarkSurfaceHigh = CheatLockNavySurface
val CheatLockDarkSurfaceGlass = CheatLockNavyRich.copy(alpha = 0.85f)

val CheatLockTextPrimaryDark = CheatLockWhite
val CheatLockTextSecondaryDark = Color(0xFF9CA3AF)
val CheatLockTextTertiaryDark = Color(0xFF6B7280)

val CheatLockAccent = CheatLockPurpleSoft
val CheatLockAccentSoft = Color(0xFFDDD6FE) // Lightest purple for highlights

val CheatLockGlassBorder = Color(0x1AFFFFFF)
val CheatLockGlassHighlight = Color(0x08FFFFFF)

val CheatLockGradientStart = CheatLockPurpleVibrant
val CheatLockGradientMid = CheatLockPurpleSoft
val CheatLockGradientEnd = CheatLockNavyRich
val CheatLockOutline = CheatLockNavyBorder

// Specific Theme Palettes
// LIGHT MODE (World-Class EdTech & Security Palette):
val CheatLockLightBackground = Color(0xFFF6F8FC)       // Soft cool-neutral canvas
val CheatLockLightBg = CheatLockLightBackground
val CheatLockLightSurface = Color(0xFFFFFFFF)          // Crisp White Surface
val CheatLockLightSurfaceSubtle = Color(0xFFF1F5F9)    // Secondary / Subdued Container
val CheatLockLightSurfaceElevated = Color(0xFFFFFFFF)
val CheatLockLightBorder = Color(0xFFE2E8F0)           // Clean micro-border
val CheatLockLightBorderFocus = Color(0xFF2563EB)      // Active focus ring
val CheatLockLightBorderSubtle = Color(0xFFEDF2F7)

val CheatLockLightPrimary = Color(0xFF2563EB)          // Royal Brand Blue
val CheatLockLightPrimaryDark = Color(0xFF1D4ED8)      // Pressed / Active Blue
val CheatLockLightPrimaryContainer = Color(0xFFEFF6FF) // 10% Blue highlight tint
val CheatLockLightSecondary = Color(0xFF4F46E5)        // Refined Indigo Accent
val CheatLockLightSecondaryContainer = Color(0xFFEEF2FF)

val CheatLockLightTextPrimary = Color(0xFF0F172A)      // Deep Slate (High Contrast)
val CheatLockLightText = CheatLockLightTextPrimary
val CheatLockLightTextSecondary = Color(0xFF475569)    // Medium Slate
val CheatLockLightTextMuted = Color(0xFF94A3B8)        // Light Slate helper

val CheatLockLightSuccess = Color(0xFF10B981)
val CheatLockLightSuccessContainer = Color(0xFFECFDF5)
val CheatLockLightWarning = Color(0xFFF59E0B)
val CheatLockLightWarningContainer = Color(0xFFFFFBEB)
val CheatLockLightDanger = Color(0xFFEF4444)
val CheatLockLightDangerContainer = Color(0xFFFEF2F2)
val CheatLockLightInfo = Color(0xFF0284C7)
val CheatLockLightInfoContainer = Color(0xFFF0F9FF)

// DARK MODE: Background: #0F172A, Surface: #1E293B, Primary: #3B82F6, Secondary: #38BDF8, Text: #F8FAFC
val CheatLockDarkBackgroundNew = Color(0xFF0F172A)
val CheatLockDarkSurfaceNew = Color(0xFF1E293B)
val CheatLockDarkPrimaryNew = Color(0xFF3B82F6)
val CheatLockDarkSecondaryNew = Color(0xFF38BDF8)
val CheatLockDarkPrimaryContainerNew = Color(0xFF1E3A8A)
val CheatLockDarkTextNew = Color(0xFFF8FAFC)
