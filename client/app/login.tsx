import React, { useState } from 'react';
import {
                    View,
                    Text,
                    TextInput,
                    TouchableOpacity,
                    StyleSheet,
                    KeyboardAvoidingView,
                    Platform,
                    ActivityIndicator,
                    Alert,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/config';

export default function LoginScreen() {
                    const [username, setUsername] = useState('');
                    const [password, setPassword] = useState('');
                    const [isSubmitting, setIsSubmitting] = useState(false);
                    const { login } = useAuth();

                    const handleLogin = async () => {
                                        if (!username.trim() || !password.trim()) {
                                                            Alert.alert('Error', 'Please enter username and password');
                                                            return;
                                        }

                                        setIsSubmitting(true);
                                        try {
                                                            await login(username, password);
                                                            console.log('Login successful, waiting for redirect...');
                                                            // Router redirect is handled by _layout.tsx based on auth state
                                        } catch (error: any) {
                                                            const message = error.response?.data?.error?.message || 'Login failed. Please try again.';
                                                            Alert.alert('Login Failed', message);
                                        } finally {
                                                            setIsSubmitting(false);
                                        }
                    };

                    return (
                                        <KeyboardAvoidingView
                                                            style={styles.container}
                                                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                        >
                                                            <View style={styles.content}>
                                                                                {/* Logo/Title */}
                                                                                <View style={styles.header}>
                                                                                                    {/* <View style={styles.logoContainer}>
                                                                                                                        <View style={styles.logoIcon}>
                                                                                                                                            <Text style={styles.logoText}>🔬</Text>
                                                                                                                        </View>
                                                                                                    </View> */}
                                                                                                    <Text style={styles.title}>Cell Analysis</Text>
                                                                                                    <Text style={styles.subtitle}>Login to your account</Text>
                                                                                </View>

                                                                                {/* Form */}
                                                                                <View style={styles.form}>
                                                                                                    <View style={styles.inputContainer}>
                                                                                                                        <Text style={styles.label}>Username</Text>
                                                                                                                        <TextInput
                                                                                                                                            style={styles.input}
                                                                                                                                            placeholder="Enter your username"
                                                                                                                                            placeholderTextColor={Colors.textPlaceholder}
                                                                                                                                            value={username}
                                                                                                                                            onChangeText={setUsername}
                                                                                                                                            autoCapitalize="none"
                                                                                                                                            autoCorrect={false}
                                                                                                                        />
                                                                                                    </View>

                                                                                                    <View style={styles.inputContainer}>
                                                                                                                        <Text style={styles.label}>Password</Text>
                                                                                                                        <TextInput
                                                                                                                                            style={styles.input}
                                                                                                                                            placeholder="Enter your password"
                                                                                                                                            placeholderTextColor={Colors.textPlaceholder}
                                                                                                                                            value={password}
                                                                                                                                            onChangeText={setPassword}
                                                                                                                                            secureTextEntry
                                                                                                                        />
                                                                                                    </View>

                                                                                                    <TouchableOpacity
                                                                                                                        style={[styles.button, isSubmitting && styles.buttonDisabled]}
                                                                                                                        onPress={handleLogin}
                                                                                                                        disabled={isSubmitting}
                                                                                                    >
                                                                                                                        {isSubmitting ? (
                                                                                                                                            <ActivityIndicator color={Colors.white} />
                                                                                                                        ) : (
                                                                                                                                            <Text style={styles.buttonText}>Login</Text>
                                                                                                                        )}
                                                                                                    </TouchableOpacity>
                                                                                </View>

                                                                                {/* Register Link */}
                                                                                <View style={styles.footer}>
                                                                                                    <Text style={styles.footerText}>Don't have an account? </Text>
                                                                                                    <Link href="/register" asChild>
                                                                                                                        <TouchableOpacity>
                                                                                                                                            <Text style={styles.linkText}>Register</Text>
                                                                                                                        </TouchableOpacity>
                                                                                                    </Link>
                                                                                </View>
                                                            </View>
                                        </KeyboardAvoidingView>
                    );
}

const styles = StyleSheet.create({
                    container: {
                                        flex: 1,
                                        backgroundColor: Colors.background,
                    },
                    content: {
                                        flex: 1,
                                        justifyContent: 'center',
                                        paddingHorizontal: 24,
                    },
                    header: {
                                        alignItems: 'center',
                                        marginBottom: 40,
                    },
                    logoContainer: {
                                        marginBottom: 16,
                    },
                    logoIcon: {
                                        width: 80,
                                        height: 80,
                                        borderRadius: 20,
                                        backgroundColor: Colors.primaryDark,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                    },
                    logoText: {
                                        fontSize: 40,
                    },
                    title: {
                                        fontSize: 28,
                                        fontWeight: '700',
                                        color: Colors.textPrimary,
                                        marginBottom: 8,
                    },
                    subtitle: {
                                        fontSize: 16,
                                        color: Colors.textMuted,
                    },
                    form: {
                                        gap: 16,
                    },
                    inputContainer: {
                                        gap: 8,
                    },
                    label: {
                                        fontSize: 14,
                                        fontWeight: '500',
                                        color: Colors.textPrimary,
                    },
                    input: {
                                        backgroundColor: Colors.surface,
                                        borderWidth: 1,
                                        borderColor: Colors.surfaceBorder,
                                        borderRadius: 12,
                                        paddingHorizontal: 16,
                                        paddingVertical: 14,
                                        fontSize: 16,
                                        color: Colors.textPrimary,
                    },
                    button: {
                                        backgroundColor: Colors.primaryDark,
                                        borderRadius: 12,
                                        paddingVertical: 16,
                                        alignItems: 'center',
                                        marginTop: 8,
                    },
                    buttonDisabled: {
                                        opacity: 0.7,
                    },
                    buttonText: {
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: '600',
                    },
                    footer: {
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        marginTop: 24,
                    },
                    footerText: {
                                        color: Colors.textMuted,
                                        fontSize: 14,
                    },
                    linkText: {
                                        color: Colors.primaryDark,
                                        fontSize: 14,
                                        fontWeight: '600',
                    },
});
