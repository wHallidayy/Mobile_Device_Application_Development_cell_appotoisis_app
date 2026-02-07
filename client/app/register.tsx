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
                    ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/config';

export default function RegisterScreen() {
                    const [username, setUsername] = useState('');
                    const [password, setPassword] = useState('');
                    const [confirmPassword, setConfirmPassword] = useState('');
                    const [isSubmitting, setIsSubmitting] = useState(false);
                    const { register } = useAuth();

                    const handleRegister = async () => {
                                        if (!username.trim() || !password.trim()) {
                                                            Alert.alert('Error', 'Please fill in all fields');
                                                            return;
                                        }

                                        if (password !== confirmPassword) {
                                                            Alert.alert('Error', 'Passwords do not match');
                                                            return;
                                        }

                                        if (password.length < 8) {
                                                            Alert.alert('Error', 'Password must be at least 8 characters');
                                                            return;
                                        }

                                        setIsSubmitting(true);
                                        try {
                                                            await register(username, password);
                                                            router.replace('/(tabs)');
                                        } catch (error: any) {
                                                            const message = error.response?.data?.error?.message || 'Registration failed. Please try again.';
                                                            Alert.alert('Registration Failed', message);
                                        } finally {
                                                            setIsSubmitting(false);
                                        }
                    };

                    return (
                                        <KeyboardAvoidingView
                                                            style={styles.container}
                                                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                        >
                                                            <ScrollView
                                                                                contentContainerStyle={styles.scrollContent}
                                                                                keyboardShouldPersistTaps="handled"
                                                            >
                                                                                <View style={styles.content}>
                                                                                                    {/* Header */}
                                                                                                    <View style={styles.header}>
          {/* <                                                                                                              <View style={styles.logoContainer}>
                                                                                                                                            <View style={styles.logoIcon}>
                                                                                                                                                                <Text style={styles.logoText}>🔬</Text>
                                                                                                                                            </View>
                                                                                                                        </View>> */}
                                                                                                                        <Text style={styles.title}>Create Account</Text>
                                                                                                                        <Text style={styles.subtitle}>Sign up to get started</Text>
                                                                                                    </View>

                                                                                                    {/* Form */}
                                                                                                    <View style={styles.form}>
                                                                                                                        <View style={styles.inputContainer}>
                                                                                                                                            <Text style={styles.label}>Username</Text>
                                                                                                                                            <TextInput
                                                                                                                                                                style={styles.input}
                                                                                                                                                                placeholder="Choose a username"
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
                                                                                                                                                                placeholder="Create a password"
                                                                                                                                                                placeholderTextColor={Colors.textPlaceholder}
                                                                                                                                                                value={password}
                                                                                                                                                                onChangeText={setPassword}
                                                                                                                                                                secureTextEntry
                                                                                                                                            />
                                                                                                                        </View>

                                                                                                                        <View style={styles.inputContainer}>
                                                                                                                                            <Text style={styles.label}>Confirm Password</Text>
                                                                                                                                            <TextInput
                                                                                                                                                                style={styles.input}
                                                                                                                                                                placeholder="Confirm your password"
                                                                                                                                                                placeholderTextColor={Colors.textPlaceholder}
                                                                                                                                                                value={confirmPassword}
                                                                                                                                                                onChangeText={setConfirmPassword}
                                                                                                                                                                secureTextEntry
                                                                                                                                            />
                                                                                                                        </View>

                                                                                                                        <TouchableOpacity
                                                                                                                                            style={[styles.button, isSubmitting && styles.buttonDisabled]}
                                                                                                                                            onPress={handleRegister}
                                                                                                                                            disabled={isSubmitting}
                                                                                                                        >
                                                                                                                                            {isSubmitting ? (
                                                                                                                                                                <ActivityIndicator color={Colors.white} />
                                                                                                                                            ) : (
                                                                                                                                                                <Text style={styles.buttonText}>Register</Text>
                                                                                                                                            )}
                                                                                                                        </TouchableOpacity>
                                                                                                    </View>

                                                                                                    {/* Login Link */}
                                                                                                    <View style={styles.footer}>
                                                                                                                        <Text style={styles.footerText}>Already have an account? </Text>
                                                                                                                        <Link href="/login" asChild>
                                                                                                                                            <TouchableOpacity>
                                                                                                                                                                <Text style={styles.linkText}>Login</Text>
                                                                                                                                            </TouchableOpacity>
                                                                                                                        </Link>
                                                                                                    </View>
                                                                                </View>
                                                            </ScrollView>
                                        </KeyboardAvoidingView>
                    );
}

const styles = StyleSheet.create({
                    container: {
                                        flex: 1,
                                        backgroundColor: Colors.background,
                    },
                    scrollContent: {
                                        flexGrow: 1,
                    },
                    content: {
                                        flex: 1,
                                        justifyContent: 'center',
                                        paddingHorizontal: 24,
                                        paddingVertical: 40,
                    },
                    header: {
                                        alignItems: 'center',
                                        marginBottom: 32,
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
