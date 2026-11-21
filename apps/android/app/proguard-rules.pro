# VNex Solar Android Release R8 / ProGuard Configuration
# Keep serialization, Retrofit, OkHttp, Room, Hilt, WorkManager, CameraX, and ML Kit metadata intact
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, RuntimeVisibleAnnotations, Exceptions

# Strip verbose/debug/info logs from release APKs to prevent accidental field data leakage
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Kotlinx Serialization
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-dontwarn kotlinx.serialization.**
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <fields>;
}
-keep,includedescriptorclasses class com.vnexsolar.app.**$$serializer { *; }
-keepclassmembers class com.vnexsolar.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.vnexsolar.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit / OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Room & Hilt & WorkManager
-keep class * extends androidx.room.RoomDatabase
-keep class * extends androidx.work.CoroutineWorker { <init>(...); }
-dontwarn androidx.room.paging.**
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# CameraX & ML Kit Barcode Scanning
-keep class androidx.camera.** { *; }
-keep class com.google.mlkit.vision.barcode.** { *; }
-dontwarn com.google.mlkit.**
