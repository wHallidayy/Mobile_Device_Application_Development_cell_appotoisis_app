import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/config';
import { CellCounts, CellPercentages } from '@/services/analysisService';

interface ResultsPanelProps {
                    cellCounts: CellCounts;
                    cellPercentages: CellPercentages;
}

export default function ResultsPanel({ cellCounts, cellPercentages }: ResultsPanelProps) {
                    return (
                                        <View style={styles.container}>
                                                            {/* Cell Types with Percentages */}
                                                            <View style={styles.header}>
                                                                                <View style={styles.cellTypes}>
                                                                                                    <View style={styles.cellType}>
                                                                                                                        <Text style={[styles.cellLabel, styles.apoptosisLabel]}>Apoptosis cell</Text>
                                                                                                                        <Text style={[styles.cellPercentage, styles.apoptosisValue]}>
                                                                                                                                            {cellPercentages.apoptosis.toFixed(0)}%
                                                                                                                        </Text>
                                                                                                    </View>
                                                                                                    <View style={styles.cellType}>
                                                                                                                        <Text style={[styles.cellLabel, styles.viableLabel]}>Viable cell</Text>
                                                                                                                        <Text style={[styles.cellPercentage, styles.viableValue]}>
                                                                                                                                            {cellPercentages.viable.toFixed(0)}%
                                                                                                                        </Text>
                                                                                                    </View>
                                                                                                    <View style={styles.cellType}>
                                                                                                                        <Text style={[styles.cellLabel, styles.otherLabel]}>Other cell</Text>
                                                                                                                        <Text style={[styles.cellPercentage, styles.otherValue]}>
                                                                                                                                            {cellPercentages.other.toFixed(0)}%
                                                                                                                        </Text>
                                                                                                    </View>
                                                                                </View>
                                                            </View>

                                                            {/* Progress Bar */}
                                                            <View style={styles.progressContainer}>
                                                                                <View style={styles.progressBar}>
                                                                                                    <View
                                                                                                                        style={[styles.progressSegment, styles.progressApoptosis, { width: `${cellPercentages.apoptosis}%` }]}
                                                                                                    />
                                                                                                    <View
                                                                                                                        style={[styles.progressSegment, styles.progressViable, { width: `${cellPercentages.viable}%` }]}
                                                                                                    />
                                                                                                    <View
                                                                                                                        style={[styles.progressSegment, styles.progressOther, { width: `${cellPercentages.other}%` }]}
                                                                                                    />
                                                                                </View>
                                                            </View>

                                                            {/* Cell Counts */}
                                                            <View style={styles.cellCounts}>
                                                                                <View style={styles.countItem}>
                                                                                                    <Text style={styles.countLabel}>Total apoptosis cell</Text>
                                                                                                    <Text style={styles.countValue}>{cellCounts.apoptosis}</Text>
                                                                                </View>
                                                                                <View style={styles.countItem}>
                                                                                                    <Text style={styles.countLabel}>Total viable cell</Text>
                                                                                                    <Text style={styles.countValue}>{cellCounts.viable}</Text>
                                                                                </View>
                                                                                <View style={styles.countItem}>
                                                                                                    <Text style={styles.countLabel}>Total other cell</Text>
                                                                                                    <Text style={styles.countValue}>{cellCounts.other}</Text>
                                                                                </View>
                                                            </View>
                                        </View>
                    );
}

const styles = StyleSheet.create({
                    container: {
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        borderRadius: 12,
                                        padding: 20,
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 8 },
                                        shadowOpacity: 0.2,
                                        shadowRadius: 16,
                                        elevation: 10,
                    },
                    header: {
                                        marginBottom: 16,
                    },
                    cellTypes: {
                                        flexDirection: 'row',
                                        gap: 32,
                                        flexWrap: 'wrap',
                    },
                    cellType: {
                                        flexDirection: 'column',
                    },
                    cellLabel: {
                                        fontSize: 11,
                                        fontWeight: '500',
                                        marginBottom: 4,
                    },
                    apoptosisLabel: {
                                        color: Colors.apoptosis,
                    },
                    viableLabel: {
                                        color: Colors.normal,
                    },
                    otherLabel: {
                                        color: '#666',
                    },
                    cellPercentage: {
                                        fontSize: 24,
                                        fontWeight: '600',
                    },
                    apoptosisValue: {
                                        color: Colors.apoptosis,
                    },
                    viableValue: {
                                        color: Colors.normal,
                    },
                    otherValue: {
                                        color: '#666',
                    },
                    progressContainer: {
                                        marginBottom: 16,
                    },
                    progressBar: {
                                        flexDirection: 'row',
                                        height: 8,
                                        backgroundColor: '#8A929A',
                                        borderRadius: 4,
                                        overflow: 'hidden',
                    },
                    progressSegment: {
                                        height: '100%',
                    },
                    progressApoptosis: {
                                        backgroundColor: Colors.apoptosis,
                    },
                    progressViable: {
                                        backgroundColor: Colors.normal,
                    },
                    progressOther: {
                                        backgroundColor: '#A3A9B0',
                    },
                    cellCounts: {
                                        flexDirection: 'row',
                                        gap: 30,
                                        flexWrap: 'wrap',
                                        paddingTop: 12,
                                        borderTopWidth: 1,
                                        borderTopColor: '#B4B4B4',
                    },
                    countItem: {
                                        flexDirection: 'column',
                    },
                    countLabel: {
                                        fontSize: 11,
                                        color: '#888',
                    },
                    countValue: {
                                        fontSize: 16,
                                        fontWeight: '600',
                                        color: Colors.textPrimary,
                    },
});
