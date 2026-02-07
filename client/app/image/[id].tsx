import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    useWindowDimensions,
    ActivityIndicator,
    Modal,
    StatusBar,
    Alert,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, API_URL } from '@/constants/config';
import { authService } from '@/services/authService';
import { imageService } from '@/services/imageService';
import { analysisService, AnalysisResultResponse, BoundingBox } from '@/services/analysisService';
import { BoundingBoxOverlay } from '@/components/BoundingBoxOverlay';
import { networkService } from '@/services/networkService';
import { imageCacheService } from '@/services/imageCacheService';

// Results panel component - now accepts real data
interface ResultsPanelProps {
    isNarrow: boolean;
    analysisResult: AnalysisResultResponse | null;
    isAnalyzing: boolean;
    isOnline: boolean;
    onAnalyze: () => void;
}

function ResultsPanel({ isNarrow, analysisResult, isAnalyzing, isOnline, onAnalyze }: ResultsPanelProps) {
    if (isAnalyzing) {
        return (
            <View style={[styles.resultsPanel, isNarrow && styles.resultsPanelNarrow]}>
                <View style={styles.analyzingContainer}>
                    <ActivityIndicator size="small" color={Colors.primaryDark} />
                    <Text style={styles.analyzingText}>Analyzing image...</Text>
                </View>
            </View>
        );
    }

    if (!analysisResult) {
        // Offline check
        if (!isOnline) {
            return (
                <View style={[styles.resultsPanel, isNarrow && styles.resultsPanelNarrow]}>
                    <View style={styles.analyzingContainer}>
                        <Ionicons name="cloud-offline-outline" size={24} color={Colors.textSecondary} />
                        <Text style={styles.analyzingText}>Analysis unavailable offline</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={[styles.resultsPanel, isNarrow && styles.resultsPanelNarrow]}>
                <TouchableOpacity style={styles.analyzeBtn} onPress={onAnalyze}>
                    <Ionicons name="analytics-outline" size={20} color={Colors.white} />
                    <Text style={styles.analyzeBtnText}>Analyze Image</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const data = {
        apoptosis: analysisResult.percentages.apoptosis,
        normal: analysisResult.percentages.viable,
        other: analysisResult.percentages.other,
        totalApoptosis: analysisResult.counts.apoptosis,
        totalNormal: analysisResult.counts.viable,
        totalOther: analysisResult.counts.other,
    };

    return (
        <View style={[styles.resultsPanel, isNarrow && styles.resultsPanelNarrow]}>
            {/* Header with cell types */}
            <View style={[styles.resultsHeader, isNarrow && styles.resultsHeaderNarrow]}>
                <View style={[styles.cellTypes, isNarrow && styles.cellTypesNarrow]}>
                    <View style={styles.cellType}>
                        <Text style={[styles.cellLabel, styles.apoptosisLabel]}>Apoptosis cell</Text>
                        <Text style={[styles.cellPercentage, styles.apoptosisValue, isNarrow && styles.cellPercentageNarrow]}>{Math.round(data.apoptosis)}%</Text>
                    </View>
                    <View style={styles.cellType}>
                        <Text style={[styles.cellLabel, styles.normalLabel]}>Normal cell</Text>
                        <Text style={[styles.cellPercentage, styles.normalValue, isNarrow && styles.cellPercentageNarrow]}>{Math.round(data.normal)}%</Text>
                    </View>
                    <View style={styles.cellType}>
                        <Text style={[styles.cellLabel, styles.otherLabel]}>Other cell</Text>
                        <Text style={[styles.cellPercentage, styles.otherValue, isNarrow && styles.cellPercentageNarrow]}>{Math.round(data.other)}%</Text>
                    </View>
                </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <View style={[styles.progressSegment, styles.progressApoptosis, { width: `${data.apoptosis}%` }]} />
                    <View style={[styles.progressSegment, styles.progressNormal, { width: `${data.normal}%` }]} />
                    <View style={[styles.progressSegment, styles.progressOther, { width: `${data.other}%` }]} />
                </View>
            </View>

            {/* Cell Counts */}
            <View style={[styles.cellCounts, isNarrow && styles.cellCountsNarrow]}>
                <View style={styles.countItem}>
                    <Text style={styles.countLabel}>Total apoptosis</Text>
                    <Text style={styles.countValue}>{data.totalApoptosis}</Text>
                </View>
                <View style={styles.countItem}>
                    <Text style={styles.countLabel}>Total normal</Text>
                    <Text style={styles.countValue}>{data.totalNormal}</Text>
                </View>
                <View style={styles.countItem}>
                    <Text style={styles.countLabel}>Total other</Text>
                    <Text style={styles.countValue}>{data.totalOther}</Text>
                </View>
            </View>
        </View>
    );
}

export default function ImageDetailScreen() {
    const { id, imageName } = useLocalSearchParams<{
        id: string;
        imageName?: string;
    }>();

    const { width, height } = useWindowDimensions();
    const isNarrow = width < 600;
    const isLandscape = width > height;

    const [showResults, setShowResults] = useState(true);
    const [token, setToken] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fileName, setFileName] = useState<string>(`image_${id}`);

    // Analysis state
    const [analysisResult, setAnalysisResult] = useState<AnalysisResultResponse | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
    const [imageContainerSize, setImageContainerSize] = useState({ width: 0, height: 0 });
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

    // Offline state
    const [isOnline, setIsOnline] = useState(networkService.getIsOnline());
    const [cachedImageUri, setCachedImageUri] = useState<string | null>(null);

    // Zoom/Pan State
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Reset zoom state when fullscreen changes
    useEffect(() => {
        if (!isFullscreen) {
            scale.value = 1;
            savedScale.value = 1;
            translateX.value = 0;
            savedTranslateX.value = 0;
            translateY.value = 0;
            savedTranslateY.value = 0;
        }
    }, [isFullscreen]);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = savedScale.value * e.scale;
        })
        .onEnd(() => {
            if (scale.value < 1) {
                scale.value = withSpring(1);
                savedScale.value = 1;
            } else {
                savedScale.value = scale.value;
            }
        });

    const panGesture = Gesture.Pan()
        .averageTouches(true)
        .onUpdate((e) => {
            if (scale.value > 1) {
                translateX.value = savedTranslateX.value + e.translationX;
                translateY.value = savedTranslateY.value + e.translationY;
            }
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value }
        ]
    }));

    // Fetch token, image details and analysis on mount
    useEffect(() => {
        authService.getStoredToken().then(setToken);

        // Listen for network changes
        const unsubscribe = networkService.addListener((online) => {
            setIsOnline(online);
        });

        // Fetch image details and setup caching
        if (id) {
            const imageId = Number(id);

            // Cache image in background for offline access
            imageCacheService.getImageUri(imageId, networkService.getIsOnline())
                .then(({ uri, isLocal }) => {
                    if (uri) {
                        setCachedImageUri(uri);
                    }
                })
                .catch(console.error);

            imageService.getImage(imageId)
                .then((data: any) => {
                    if (data?.original_filename) {
                        setFileName(data.original_filename);
                    }
                    // Get image dimensions if available
                    if (data?.width && data?.height) {
                        setImageDimensions({ width: data.width, height: data.height });
                    }
                })
                .catch(err => console.log('Failed to fetch image details:', err));

            // Fetch analysis data (with offline fallback)
            loadAnalysisData(imageId);
        }

        return () => unsubscribe();
    }, [id]);

    const loadAnalysisData = async (imageId: number) => {
        try {
            // Use offline-aware method that falls back to cached results
            const result = await analysisService.getAnalysisResultWithOfflineFallback(imageId);
            if (result) {
                setAnalysisResult(result);
                // Extract bounding boxes
                if (result.raw_data?.bounding_boxes) {
                    setBoundingBoxes(result.raw_data.bounding_boxes);
                }
            }
        } catch (error) {
            console.log('No analysis data available:', error);
        }
    };

    const handleAnalyze = async () => {
        if (!id || isAnalyzing) return;

        if (!isOnline) {
            Alert.alert('Offline', 'Cannot analyze image while offline.');
            return;
        }

        setIsAnalyzing(true);
        try {
            const response = await analysisService.analyzeImage(Number(id));
            const result = await analysisService.waitForJobCompletion(response.job_id);
            setAnalysisResult(result);
            if (result.raw_data?.bounding_boxes) {
                setBoundingBoxes(result.raw_data.bounding_boxes);
            }
        } catch (error) {
            console.error('Analysis failed:', error);
            Alert.alert('Error', 'Failed to analyze image');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const imageUri = cachedImageUri || `${API_URL}/images/${id}/file`;
    const imageSource = cachedImageUri
        ? { uri: cachedImageUri }
        : { uri: `${API_URL}/images/${id}/file`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={[styles.fileHeader, isNarrow && styles.fileHeaderNarrow]}>
                    <View style={[styles.breadcrumb, isNarrow && styles.breadcrumbNarrow]}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        {!isNarrow && (
                            <>
                                <Ionicons name="folder-outline" size={18} color={Colors.textPrimary} />
                                <Text style={styles.breadcrumbText}>Dashboard /</Text>
                                <Text style={styles.breadcrumbText}>folder /</Text>
                            </>
                        )}
                        <Text style={[styles.breadcrumbCurrent, isNarrow && styles.breadcrumbCurrentNarrow]} numberOfLines={1}>
                            {fileName}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        {!isOnline && (
                            <View style={styles.offlineBadge}>
                                <Ionicons name="cloud-offline-outline" size={16} color={Colors.white} />
                                <Text style={styles.offlineText}>Offline</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={styles.eyeBtn}
                            onPress={() => setShowResults(!showResults)}
                        >
                            <Ionicons
                                name={showResults ? 'eye' : 'eye-off'}
                                size={20}
                                color={Colors.white}
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Main Content */}
                <View style={[styles.mainContent, isNarrow && styles.mainContentNarrow]}>
                    {/* Image Container */}
                    <View style={[
                        styles.imageContainer,
                        isLandscape && !isNarrow && styles.imageContainerLandscape
                    ]}>
                        {/* Loading Indicator */}
                        {imageLoading && (
                            <View style={styles.loadingOverlay}>
                                <ActivityIndicator size="large" color={Colors.primaryDark} />
                            </View>
                        )}

                        {/* Tappable Image */}
                        <TouchableOpacity
                            style={styles.imageTouchable}
                            activeOpacity={0.9}
                            onPress={() => setIsFullscreen(true)}
                        >
                            <ExpoImage
                                source={imageSource}
                                style={styles.fullImage}
                                contentFit="contain"
                                transition={300}
                                onLoadStart={() => setImageLoading(true)}
                                onLoadEnd={() => setImageLoading(false)}
                            />
                        </TouchableOpacity>

                        {/* Tap hint */}
                        {!imageLoading && (
                            <View style={styles.tapHint}>
                                <Ionicons name="expand-outline" size={16} color="rgba(255,255,255,0.7)" />
                                <Text style={styles.tapHintText}>แตะเพื่อดูเต็มจอ</Text>
                            </View>
                        )}

                        {/* Results Panel - Fixed at bottom */}
                        {showResults && (
                            <View style={[
                                styles.resultsPanelContainer,
                                isNarrow && styles.resultsPanelContainerNarrow
                            ]}>
                                <ResultsPanel
                                    isNarrow={isNarrow}
                                    analysisResult={analysisResult}
                                    isAnalyzing={isAnalyzing}
                                    isOnline={isOnline}
                                    onAnalyze={handleAnalyze}
                                />
                            </View>
                        )}

                        {/* Bounding Box Overlay */}
                        {showResults && boundingBoxes.length > 0 && imageDimensions.width > 0 && (
                            <BoundingBoxOverlay
                                boundingBoxes={boundingBoxes}
                                imageWidth={imageDimensions.width}
                                imageHeight={imageDimensions.height}
                                containerWidth={width - (isNarrow ? 32 : 48)}
                                containerHeight={height * 0.6}
                                showAnnotations={true}
                            />
                        )}
                    </View>
                </View>
            </SafeAreaView>

            {/* Fullscreen Modal */}
            <Modal
                visible={isFullscreen}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsFullscreen(false)}
            >
                <StatusBar hidden={isFullscreen} />
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <View style={styles.fullscreenContainer}>
                        {/* Close button */}
                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={() => setIsFullscreen(false)}
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>

                        {/* Fullscreen Image - with Zoom/Pan */}
                        <GestureDetector gesture={composedGesture}>
                            <View style={styles.fullscreenImageWrapper}>
                                <Animated.View style={[{ width: width, height: height }, animatedStyle]}>
                                    <ExpoImage
                                        source={imageSource}
                                        style={styles.fullscreenImage}
                                        contentFit="contain"
                                    />
                                </Animated.View>
                            </View>
                        </GestureDetector>
                    </View>
                </GestureHandlerRootView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainContent: {
        flex: 1,
        padding: 20,
    },
    mainContentNarrow: {
        padding: 10,
    },
    fileHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    fileHeaderNarrow: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    breadcrumb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    breadcrumbNarrow: {
        gap: 6,
    },
    backBtn: {
        padding: 4,
    },
    breadcrumbText: {
        fontSize: 14,
        color: Colors.textPrimary,
    },
    breadcrumbCurrent: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    breadcrumbCurrentNarrow: {
        fontSize: 14,
        flex: 1,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
    },
    eyeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primaryDark,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageContainer: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        minHeight: 300,
    },
    imageContainerLandscape: {
        maxHeight: '85%',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(26, 26, 46, 0.8)',
        zIndex: 10,
    },
    imageTouchable: {
        flex: 1,
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    tapHint: {
        position: 'absolute',
        top: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
    },
    tapHintText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
    },
    resultsPanelContainer: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
    },
    resultsPanelContainerNarrow: {
        left: 8,
        right: 8,
        bottom: 8,
    },
    resultsPanel: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
    },
    resultsPanelNarrow: {
        padding: 12,
    },
    resultsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    resultsHeaderNarrow: {
        marginBottom: 10,
    },
    cellTypes: {
        flexDirection: 'row',
        gap: 24,
        flexWrap: 'wrap',
    },
    cellTypesNarrow: {
        gap: 12,
    },
    cellType: {
        flexDirection: 'column',
    },
    cellLabel: {
        fontSize: 11,
        fontWeight: '500',
        marginBottom: 2,
    },
    apoptosisLabel: {
        color: Colors.apoptosis,
    },
    normalLabel: {
        color: '#5E8E85',
    },
    otherLabel: {
        color: '#666',
    },
    cellPercentage: {
        fontSize: 22,
        fontWeight: '600',
    },
    cellPercentageNarrow: {
        fontSize: 18,
    },
    apoptosisValue: {
        color: Colors.apoptosis,
    },
    normalValue: {
        color: Colors.normal,
    },
    otherValue: {
        color: '#666',
    },
    progressContainer: {
        marginBottom: 12,
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
    progressNormal: {
        backgroundColor: Colors.normal,
    },
    progressOther: {
        backgroundColor: '#A3A9B0',
    },
    cellCounts: {
        flexDirection: 'row',
        gap: 24,
        flexWrap: 'wrap',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#B4B4B4',
    },
    cellCountsNarrow: {
        gap: 12,
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
    // Fullscreen styles
    fullscreenContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenImageWrapper: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenImage: {
        width: '100%',
        height: '100%',
    },
    analyzingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        gap: 10,
    },
    analyzingText: {
        fontSize: 14,
        color: Colors.textSecondary,
    },
    analyzeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: Colors.primaryDark,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 14,
    },
    analyzeBtnText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.white,
    },
    offlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 8,
    },
    offlineText: {
        fontSize: 12,
        fontWeight: '500',
        color: Colors.white,
    },
});
