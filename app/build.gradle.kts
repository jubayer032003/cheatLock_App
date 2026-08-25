plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

import java.util.Properties

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

// Debug-only override. Release builds always use the production HTTPS endpoint.
// cheatlock.apiBaseUrl=http://<YOUR_PC_IP>:3000/
val cheatLockDebugApiBaseUrl =
    (localProperties.getProperty("cheatlock.apiBaseUrl")
        ?: providers.gradleProperty("cheatlock.apiBaseUrl").orNull
        ?: "https://cheatlock-backend.onrender.com/")
        .trim()
        .let { if (it.endsWith("/")) it else "$it/" }

fun configuredPublicUrl(name: String): String =
    (localProperties.getProperty(name) ?: providers.gradleProperty(name).orNull ?: "")
        .trim()
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")

val uploadStoreFile = providers.environmentVariable("CHEATLOCK_UPLOAD_STORE_FILE").orNull
val uploadStorePassword = providers.environmentVariable("CHEATLOCK_UPLOAD_STORE_PASSWORD").orNull
val uploadKeyAlias = providers.environmentVariable("CHEATLOCK_UPLOAD_KEY_ALIAS").orNull
val uploadKeyPassword = providers.environmentVariable("CHEATLOCK_UPLOAD_KEY_PASSWORD").orNull
val hasUploadSigningCredentials = listOf(
    uploadStoreFile,
    uploadStorePassword,
    uploadKeyAlias,
    uploadKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "com.jubayer.cheatlock"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jubayer.cheatlock"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "CHEATLOCK_API_BASE_URL", "\"https://cheatlock-backend.onrender.com/\"")
        buildConfigField("Boolean", "ENABLE_RUNTIME_TRACING", "false")
        buildConfigField("String", "PRIVACY_POLICY_URL", "\"${configuredPublicUrl("cheatlock.privacyPolicyUrl")}\"")
        buildConfigField("String", "TERMS_URL", "\"${configuredPublicUrl("cheatlock.termsUrl")}\"")
        buildConfigField("String", "ACCOUNT_DELETION_URL", "\"${configuredPublicUrl("cheatlock.accountDeletionUrl")}\"")
    }

    signingConfigs {
        if (hasUploadSigningCredentials) {
            create("upload") {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "CHEATLOCK_API_BASE_URL", "\"$cheatLockDebugApiBaseUrl\"")
            buildConfigField("Boolean", "ENABLE_RUNTIME_TRACING", "true")
        }
        release {
            isMinifyEnabled = false
            if (hasUploadSigningCredentials) {
                signingConfig = signingConfigs.getByName("upload")
            }

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.navigation:navigation-compose:2.8.0")
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation("androidx.camera:camera-camera2:1.6.1")
    implementation("androidx.camera:camera-lifecycle:1.6.1")
    implementation("androidx.camera:camera-view:1.6.1")

    implementation("com.google.mlkit:face-detection:16.1.7")
    implementation("com.google.mlkit:image-labeling:17.0.9")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    implementation("com.google.ai.edge.litert:litert:1.4.0")
    implementation("com.google.ai.edge.litert:litert-api:1.4.0")
    implementation(libs.androidx.biometric)
    implementation(libs.zxing.core)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    // Unit test dependencies
    testImplementation("junit:junit:4.13.2")
    // Android instrumented test dependencies
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:core:1.5.0")
}
