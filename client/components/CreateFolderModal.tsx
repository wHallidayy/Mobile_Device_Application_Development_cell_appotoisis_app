import React, { useState } from 'react';
import {
                    View,
                    Text,
                    TextInput,
                    TouchableOpacity,
                    StyleSheet,
                    Modal,
                    ActivityIndicator,
                    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/config';
import { validateFolderName } from '@/utils/validation';

interface CreateFolderModalProps {
                    visible: boolean;
                    onClose: () => void;
                    onSubmit: (name: string) => Promise<void>;
}

export default function CreateFolderModal({ visible, onClose, onSubmit }: CreateFolderModalProps) {
                    const [folderName, setFolderName] = useState('');
                    const [isSubmitting, setIsSubmitting] = useState(false);

                    const handleSubmit = async () => {
                                        const validation = validateFolderName(folderName);
                                        if (!validation.isValid) {
                                                            Alert.alert('Invalid Name', validation.error);
                                                            return;
                                        }

                                        setIsSubmitting(true);
                                        try {
                                                            await onSubmit(folderName.trim());
                                                            setFolderName('');
                                                            onClose();
                                        } catch (error) {
                                                            // Error handling is usually done by parent or service, but good to log here
                                                            console.error('Failed to create folder:', error);
                                                            // Optionally alert if the error didn't come from validation
                                        } finally {
                                                            setIsSubmitting(false);
                                        }
                    };

                    const handleClose = () => {
                                        setFolderName('');
                                        onClose();
                    };

                    return (
                                        <Modal
                                                            visible={visible}
                                                            transparent
                                                            animationType="fade"
                                                            onRequestClose={handleClose}
                                        >
                                                            <TouchableOpacity
                                                                                style={styles.overlay}
                                                                                activeOpacity={1}
                                                                                onPress={handleClose}
                                                            >
                                                                                <TouchableOpacity
                                                                                                    style={styles.modalContent}
                                                                                                    activeOpacity={1}
                                                                                                    onPress={() => { }}
                                                                                >
                                                                                                    <View style={styles.header}>
                                                                                                                        <Ionicons name="folder-outline" size={24} color={Colors.primaryDark} />
                                                                                                                        <Text style={styles.title}>New Folder</Text>
                                                                                                    </View>

                                                                                                    <TextInput
                                                                                                                        style={styles.input}
                                                                                                                        placeholder="Enter folder name"
                                                                                                                        placeholderTextColor={Colors.textPlaceholder}
                                                                                                                        value={folderName}
                                                                                                                        onChangeText={setFolderName}
                                                                                                                        autoFocus
                                                                                                    />

                                                                                                    <View style={styles.actions}>
                                                                                                                        <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                                                                                                                                            <Text style={styles.cancelButtonText}>Cancel</Text>
                                                                                                                        </TouchableOpacity>
                                                                                                                        <TouchableOpacity
                                                                                                                                            style={[styles.createButton, (!folderName.trim() || isSubmitting) && styles.buttonDisabled]}
                                                                                                                                            onPress={handleSubmit}
                                                                                                                                            disabled={!folderName.trim() || isSubmitting}
                                                                                                                        >
                                                                                                                                            {isSubmitting ? (
                                                                                                                                                                <ActivityIndicator color={Colors.white} size="small" />
                                                                                                                                            ) : (
                                                                                                                                                                <Text style={styles.createButtonText}>Create</Text>
                                                                                                                                            )}
                                                                                                                        </TouchableOpacity>
                                                                                                    </View>
                                                                                </TouchableOpacity>
                                                            </TouchableOpacity>
                                        </Modal>
                    );
}

const styles = StyleSheet.create({
                    overlay: {
                                        flex: 1,
                                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: 24,
                    },
                    modalContent: {
                                        width: '100%',
                                        maxWidth: 400,
                                        backgroundColor: Colors.background,
                                        borderRadius: 16,
                                        padding: 24,
                    },
                    header: {
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 12,
                                        marginBottom: 20,
                    },
                    title: {
                                        fontSize: 18,
                                        fontWeight: '600',
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
                                        marginBottom: 20,
                    },
                    actions: {
                                        flexDirection: 'row',
                                        gap: 12,
                    },
                    cancelButton: {
                                        flex: 1,
                                        backgroundColor: Colors.surface,
                                        borderWidth: 1,
                                        borderColor: Colors.surfaceBorder,
                                        borderRadius: 12,
                                        paddingVertical: 14,
                                        alignItems: 'center',
                    },
                    cancelButtonText: {
                                        fontSize: 14,
                                        fontWeight: '500',
                                        color: Colors.textPrimary,
                    },
                    createButton: {
                                        flex: 1,
                                        backgroundColor: Colors.primaryDark,
                                        borderRadius: 12,
                                        paddingVertical: 14,
                                        alignItems: 'center',
                    },
                    buttonDisabled: {
                                        opacity: 0.5,
                    },
                    createButtonText: {
                                        fontSize: 14,
                                        fontWeight: '500',
                                        color: Colors.white,
                    },
});
