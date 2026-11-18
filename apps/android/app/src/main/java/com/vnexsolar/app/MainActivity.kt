package com.vnexsolar.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import com.vnexsolar.app.core.designsystem.VNexTheme
import com.vnexsolar.app.core.navigation.VNexNavHost
import com.vnexsolar.app.core.preferences.AppPreferences
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var appPreferences: AppPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val isDarkMode by appPreferences.darkThemeFlow.collectAsState(initial = false)
            val scope = rememberCoroutineScope()

            VNexTheme(darkTheme = isDarkMode) {
                VNexNavHost(
                    isDarkTheme = isDarkMode,
                    onToggleTheme = {
                        scope.launch {
                            appPreferences.setDarkTheme(!isDarkMode)
                        }
                    },
                )
            }
        }
    }
}
