package com.jubayer.cheatlock.ui

import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Loyalty
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Loyalty
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Quiz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.R

/**
 * Student navigation destinations for CheatLock.
 */
enum class StudentNavDestination(
    @get:StringRes val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    HOME(
        labelRes = R.string.nav_home,
        selectedIcon = Icons.Filled.Home,
        unselectedIcon = Icons.Outlined.Home
    ),
    PRACTICE(
        labelRes = R.string.nav_practice,
        selectedIcon = Icons.Filled.Quiz,
        unselectedIcon = Icons.Outlined.Quiz
    ),
    RESULTS(
        labelRes = R.string.nav_results,
        selectedIcon = Icons.Filled.Assessment,
        unselectedIcon = Icons.Outlined.Assessment
    ),
    PROFILE(
        labelRes = R.string.nav_profile,
        selectedIcon = Icons.Filled.Person,
        unselectedIcon = Icons.Outlined.Person
    )
}

/**
 * Landing / Home screen navigation destinations for CheatLock.
 */
enum class HomeNavDestination(
    @get:StringRes val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    OVERVIEW(
        labelRes = R.string.nav_home,
        selectedIcon = Icons.Filled.Home,
        unselectedIcon = Icons.Outlined.Home
    ),
    FEATURES(
        labelRes = R.string.nav_features,
        selectedIcon = Icons.Filled.AutoAwesome,
        unselectedIcon = Icons.Outlined.AutoAwesome
    ),
    PRICING(
        labelRes = R.string.nav_pricing,
        selectedIcon = Icons.Filled.Loyalty,
        unselectedIcon = Icons.Outlined.Loyalty
    ),
    LOGIN(
        labelRes = R.string.nav_login,
        selectedIcon = Icons.AutoMirrored.Filled.Login,
        unselectedIcon = Icons.AutoMirrored.Filled.Login
    )
}

/**
 * World-Class Floating Bottom Navigation for CheatLock Student Dashboard.
 */
@Composable
fun CheatLockBottomNavigation(
    selectedDestination: StudentNavDestination,
    onDestinationSelected: (StudentNavDestination) -> Unit,
    modifier: Modifier = Modifier,
    destinations: List<StudentNavDestination> = StudentNavDestination.entries
) {
    val selectedIndex = destinations.indexOf(selectedDestination).coerceAtLeast(0)

    CheatLockAnimatedFloatingBar(
        selectedIndex = selectedIndex,
        itemCount = destinations.size,
        modifier = modifier
    ) {
        destinations.forEachIndexed { index, destination ->
            val isSelected = destination == selectedDestination
            val label = stringResource(destination.labelRes)

            CheatLockBottomNavItem(
                label = label,
                selectedIcon = destination.selectedIcon,
                unselectedIcon = destination.unselectedIcon,
                isSelected = isSelected,
                onClick = { onDestinationSelected(destination) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/**
 * World-Class Floating Bottom Navigation for CheatLock Home / Landing Screen.
 */
@Composable
fun CheatLockHomeBottomNavigation(
    selectedDestination: HomeNavDestination,
    onDestinationSelected: (HomeNavDestination) -> Unit,
    modifier: Modifier = Modifier,
    destinations: List<HomeNavDestination> = HomeNavDestination.entries
) {
    val selectedIndex = destinations.indexOf(selectedDestination).coerceAtLeast(0)

    CheatLockAnimatedFloatingBar(
        selectedIndex = selectedIndex,
        itemCount = destinations.size,
        modifier = modifier
    ) {
        destinations.forEachIndexed { index, destination ->
            val isSelected = destination == selectedDestination
            val label = stringResource(destination.labelRes)

            CheatLockBottomNavItem(
                label = label,
                selectedIcon = destination.selectedIcon,
                unselectedIcon = destination.unselectedIcon,
                isSelected = isSelected,
                onClick = { onDestinationSelected(destination) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

/**
 * Reusable container with smooth sliding animated active pill indicator.
 */
@Composable
private fun CheatLockAnimatedFloatingBar(
    selectedIndex: Int,
    itemCount: Int,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit
) {
    val isLight = MaterialTheme.colorScheme.surface == Color.White ||
        MaterialTheme.colorScheme.background.red > 0.8f

    // Outer container styling
    val containerBg = MaterialTheme.colorScheme.surface
    val containerBorder = MaterialTheme.colorScheme.outline.copy(alpha = if (isLight) 0.85f else 0.55f)
    val shadowColor = if (isLight) Color(0x180F172A) else Color(0x38000000)

    // Refined CheatLock Brand Blue Active Pill Colors (Zero Purple)
    val activePillBg = if (isLight) Color(0xFFEFF6FF) else Color(0xFF1E3A8A).copy(alpha = 0.45f)
    val activePillBorder = if (isLight) Color(0xFFDBEAFE) else Color(0xFF3B82F6).copy(alpha = 0.35f)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .imePadding(),
        contentAlignment = Alignment.BottomCenter
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .shadow(
                    elevation = if (isLight) 12.dp else 16.dp,
                    shape = RoundedCornerShape(28.dp),
                    spotColor = shadowColor,
                    ambientColor = shadowColor
                ),
            shape = RoundedCornerShape(28.dp),
            color = containerBg,
            tonalElevation = 4.dp,
            border = BorderStroke(1.dp, containerBorder)
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 6.dp)
            ) {
                val totalWidth = maxWidth
                val safeItemCount = itemCount.coerceAtLeast(1)
                val itemWidth = totalWidth / safeItemCount

                // Smooth sliding active indicator pill (180–240ms FastOutSlowInEasing)
                val animatedIndicatorOffset by animateDpAsState(
                    targetValue = itemWidth * selectedIndex,
                    animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
                    label = "nav-sliding-indicator-offset"
                )

                // Background sliding pill
                Surface(
                    modifier = Modifier
                        .offset(x = animatedIndicatorOffset)
                        .width(itemWidth)
                        .height(58.dp)
                        .padding(horizontal = 3.dp, vertical = 3.dp),
                    shape = RoundedCornerShape(20.dp),
                    color = activePillBg,
                    border = BorderStroke(1.dp, activePillBorder),
                    tonalElevation = 1.dp
                ) {}

                // Interactive row of destination tabs
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                    content = content
                )
            }
        }
    }
}

@Composable
private fun CheatLockBottomNavItem(
    label: String,
    selectedIcon: ImageVector,
    unselectedIcon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptics = LocalHapticFeedback.current
    val isLight = MaterialTheme.colorScheme.surface == Color.White ||
        MaterialTheme.colorScheme.background.red > 0.8f

    // Refined Brand Blue & Slate Color Tokens
    val activeColor = if (isLight) Color(0xFF2563EB) else Color(0xFF3B82F6)
    val inactiveColor = if (isLight) Color(0xFF64748B) else Color(0xFF94A3B8)

    val iconColor by animateColorAsState(
        targetValue = if (isSelected) activeColor else inactiveColor,
        animationSpec = tween(durationMillis = 200, easing = FastOutSlowInEasing),
        label = "nav-item-icon-color"
    )

    val textColor by animateColorAsState(
        targetValue = if (isSelected) (if (isLight) Color(0xFF1D4ED8) else Color(0xFF60A5FA)) else inactiveColor,
        animationSpec = tween(durationMillis = 200, easing = FastOutSlowInEasing),
        label = "nav-item-text-color"
    )

    val scale by animateFloatAsState(
        targetValue = if (isSelected) 1.05f else 1.0f,
        animationSpec = tween(durationMillis = 200, easing = FastOutSlowInEasing),
        label = "nav-item-scale"
    )

    val itemSemantics = "$label, ${if (isSelected) "selected" else "not selected"}"

    Box(
        modifier = modifier
            .height(58.dp)
            .clip(RoundedCornerShape(20.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(bounded = true, color = activeColor.copy(alpha = 0.15f)),
                onClick = {
                    runCatching { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
                    onClick()
                }
            )
            .semantics {
                this.contentDescription = itemSemantics
                this.selected = isSelected
                this.role = Role.Tab
            }
            .padding(horizontal = 4.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.scale(scale)
        ) {
            Icon(
                imageVector = if (isSelected) selectedIcon else unselectedIcon,
                contentDescription = null,
                tint = iconColor,
                modifier = Modifier.size(22.dp)
            )

            Spacer(Modifier.height(3.dp))

            Text(
                text = label,
                color = textColor,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                    letterSpacing = 0.1.sp
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )
        }
    }
}
