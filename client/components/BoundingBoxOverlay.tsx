import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

export interface BoundingBox {
                    class: string;  // 'viable', 'apoptosis', 'other'
                    confidence: number;
                    x: number;
                    y: number;
                    width: number;
                    height: number;
}

interface BoundingBoxOverlayProps {
                    boundingBoxes: BoundingBox[];
                    imageWidth: number;
                    imageHeight: number;
                    containerWidth: number;
                    containerHeight: number;
                    showAnnotations?: boolean;
                    showLabels?: boolean;
}

// Color mapping similar to SvelteKit ImageViewer
const CLASS_COLORS: Record<string, string> = {
                    viable: '#22c55e',     // green
                    normal: '#22c55e',     // green (alias)
                    apoptosis: '#ef4444',  // red
                    other: '#6b7280',      // gray
};

function getClassColor(className: string): string {
                    return CLASS_COLORS[className.toLowerCase()] || CLASS_COLORS.other;
}

export function BoundingBoxOverlay({
                    boundingBoxes,
                    imageWidth,
                    imageHeight,
                    containerWidth,
                    containerHeight,
                    showAnnotations = true,
                    showLabels = false,
}: BoundingBoxOverlayProps) {
                    if (!showAnnotations || !boundingBoxes || boundingBoxes.length === 0) {
                                        return null;
                    }

                    // Calculate scale factors - the image is scaled to fit the container
                    const imageAspect = imageWidth / imageHeight;
                    const containerAspect = containerWidth / containerHeight;

                    let displayWidth: number;
                    let displayHeight: number;
                    let offsetX: number;
                    let offsetY: number;

                    if (imageAspect > containerAspect) {
                                        // Image is wider - fits width, letterboxed vertically
                                        displayWidth = containerWidth;
                                        displayHeight = containerWidth / imageAspect;
                                        offsetX = 0;
                                        offsetY = (containerHeight - displayHeight) / 2;
                    } else {
                                        // Image is taller - fits height, letterboxed horizontally
                                        displayHeight = containerHeight;
                                        displayWidth = containerHeight * imageAspect;
                                        offsetX = (containerWidth - displayWidth) / 2;
                                        offsetY = 0;
                    }

                    const scaleX = displayWidth / imageWidth;
                    const scaleY = displayHeight / imageHeight;

                    return (
                                        <View style={styles.overlay} pointerEvents="none">
                                                            {boundingBoxes.map((box, index) => {
                                                                                const color = getClassColor(box.class);
                                                                                const left = offsetX + box.x * scaleX;
                                                                                const top = offsetY + box.y * scaleY;
                                                                                const width = box.width * scaleX;
                                                                                const height = box.height * scaleY;

                                                                                return (
                                                                                                    <View
                                                                                                                        key={`box-${index}`}
                                                                                                                        style={[
                                                                                                                                            styles.box,
                                                                                                                                            {
                                                                                                                                                                left,
                                                                                                                                                                top,
                                                                                                                                                                width,
                                                                                                                                                                height,
                                                                                                                                                                borderColor: color,
                                                                                                                                                                backgroundColor: `${color}20`, // 20% opacity
                                                                                                                                            },
                                                                                                                        ]}
                                                                                                    >
                                                                                                                        {showLabels && (
                                                                                                                                            <View style={[styles.label, { backgroundColor: color }]}>
                                                                                                                                                                <Text style={styles.labelText}>
                                                                                                                                                                                    {box.class} {Math.round(box.confidence * 100)}%
                                                                                                                                                                </Text>
                                                                                                                                            </View>
                                                                                                                        )}
                                                                                                    </View>
                                                                                );
                                                            })}

                                                            {/* Legend */}
                                                            <View style={styles.legend}>
                                                                                <View style={styles.legendItem}>
                                                                                                    <View style={[styles.dot, { backgroundColor: CLASS_COLORS.viable }]} />
                                                                                                    <Text style={styles.legendText}>Viable</Text>
                                                                                </View>
                                                                                <View style={styles.legendItem}>
                                                                                                    <View style={[styles.dot, { backgroundColor: CLASS_COLORS.apoptosis }]} />
                                                                                                    <Text style={styles.legendText}>Apoptosis</Text>
                                                                                </View>
                                                                                <View style={styles.legendItem}>
                                                                                                    <View style={[styles.dot, { backgroundColor: CLASS_COLORS.other }]} />
                                                                                                    <Text style={styles.legendText}>Other</Text>
                                                                                </View>
                                                            </View>
                                        </View>
                    );
}

const styles = StyleSheet.create({
                    overlay: {
                                        ...StyleSheet.absoluteFillObject,
                    },
                    box: {
                                        position: 'absolute',
                                        borderWidth: 2,
                                        borderRadius: 2,
                    },
                    label: {
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: '50%',
                                        transform: [{ translateX: '-50%' }],
                                        paddingHorizontal: 4,
                                        paddingVertical: 2,
                                        borderRadius: 2,
                                        marginBottom: 2,
                    },
                    labelText: {
                                        fontSize: 10,
                                        color: 'white',
                                        fontWeight: '500',
                    },
                    legend: {
                                        position: 'absolute',
                                        top: 10,
                                        right: 10,
                                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                        padding: 8,
                                        borderRadius: 6,
                                        gap: 4,
                    },
                    legendItem: {
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                    },
                    dot: {
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                    },
                    legendText: {
                                        fontSize: 12,
                                        color: '#333',
                    },
});

export default BoundingBoxOverlay;
