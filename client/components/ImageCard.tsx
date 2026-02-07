import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Colors } from '@/constants/config';

interface ImageCardProps {
                    filename: string;
                    fileType?: string;
                    fileSize?: string;
                    lastOpened?: string;
                    imageUrl?: string;
                    onPress: () => void;
}

export default function ImageCard({
                    filename,
                    fileType = 'PNG',
                    fileSize,
                    lastOpened,
                    imageUrl,
                    onPress
}: ImageCardProps) {
                    return (
                                        <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
                                                            <View style={styles.fileIcon}>
                                                                                {imageUrl ? (
                                                                                                    <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
                                                                                ) : (
                                                                                                    <>
                                                                                                                        <View style={styles.cornerFold} />
                                                                                                                        <Text style={styles.fileType}>{fileType.toUpperCase()}</Text>
                                                                                                    </>
                                                                                )}
                                                            </View>
                                                            <View style={styles.info}>
                                                                                <Text style={styles.filename} numberOfLines={1}>{filename}</Text>
                                                                                {(fileSize || lastOpened) && (
                                                                                                    <Text style={styles.meta}>
                                                                                                                        {fileSize}{fileSize && lastOpened ? ' · ' : ''}{lastOpened}
                                                                                                    </Text>
                                                                                )}
                                                            </View>
                                        </TouchableOpacity>
                    );
}

const styles = StyleSheet.create({
                    container: {
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 16,
                                        paddingVertical: 12,
                                        paddingHorizontal: 16,
                                        borderRadius: 8,
                    },
                    fileIcon: {
                                        width: 48,
                                        height: 56,
                                        backgroundColor: Colors.surface,
                                        borderWidth: 2,
                                        borderColor: Colors.surfaceBorder,
                                        borderRadius: 4,
                                        justifyContent: 'flex-end',
                                        alignItems: 'center',
                                        paddingBottom: 4,
                                        position: 'relative',
                                        overflow: 'hidden',
                    },
                    thumbnail: {
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: 2,
                    },
                    cornerFold: {
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        width: 12,
                                        height: 12,
                                        backgroundColor: Colors.surface,
                                        borderLeftWidth: 1,
                                        borderBottomWidth: 1,
                                        borderColor: Colors.surfaceBorder,
                    },
                    fileType: {
                                        fontSize: 9,
                                        fontWeight: '600',
                                        color: '#666',
                                        backgroundColor: '#ddd',
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 2,
                    },
                    info: {
                                        flex: 1,
                    },
                    filename: {
                                        fontSize: 14,
                                        fontWeight: '500',
                                        color: Colors.textPrimary,
                                        marginBottom: 4,
                    },
                    meta: {
                                        fontSize: 12,
                                        color: Colors.textMuted,
                    },
});
