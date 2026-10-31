# R8 rules for the release build (Flutter and the plugins add their own rules automatically)

# Annotation-only classes referenced by Tink (flutter_secure_storage); not needed at runtime
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

# Flutter deferred components (Play Core) are not used
-dontwarn com.google.android.play.core.**
