import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    RefreshControl,
    ActivityIndicator,
    SafeAreaView,
    Alert,
    Modal,
    Keyboard,
    useWindowDimensions,
    Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { Colors, API_URL } from '@/constants/config';
import { imageService, Image } from '@/services/imageService';
import { folderService } from '@/services/folderService';
import { authService } from '@/services/authService';
import { analysisService, AnalysisResultResponse } from '@/services/analysisService';
import { imageCacheService } from '@/services/imageCacheService';
import { networkService } from '@/services/networkService';
import * as Haptics from 'expo-haptics';

interface FileItemProps {
    image: Image;
    isExpanded: boolean;
    isAnalyzing: boolean;
    analysisResult: AnalysisResultResponse | null;
    cachedImageUri: string | null;
    onToggle: () => void;
    onPress: () => void;
    onOpenSettings: (image: Image) => void;
    onDelete: (image: Image) => void;
    onAnalyze: (image: Image) => void;
    token: string | null;
}

function FileItem({ image, isExpanded, isAnalyzing, analysisResult, cachedImageUri, onToggle, onPress, onOpenSettings, onDelete, onAnalyze, token }: FileItemProps) {
    const { width } = useWindowDimensions();
    const isNarrow = width < 500;

    // Use cached image URI if available, otherwise fall back to server URL
    const imageSource = cachedImageUri
        ? { uri: cachedImageUri }
        : { uri: `${API_URL}/images/${image.image_id}/file`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };

    // Compute analysis display data
    const hasAnalysis = !!analysisResult;
    const analysis = analysisResult ? {
        apoptosis: analysisResult.percentages.apoptosis,
        normal: analysisResult.percentages.viable,
        other: analysisResult.percentages.other,
        totalApoptosis: analysisResult.counts.apoptosis,
        totalNormal: analysisResult.counts.viable,
        totalOther: analysisResult.counts.other,
    } : null;

    return (
        <View style={styles.fileItem}>
            <TouchableOpacity style={styles.fileHeader} onPress={onToggle}>
                <View style={styles.fileHeaderLeft}>
                    <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color={Colors.textPrimary}
                    />
                    <Text style={styles.fileName} numberOfLines={1}>{image.original_filename}</Text>
                </View>
                <View style={styles.fileHeaderRight}>
                    <TouchableOpacity style={styles.settingsIconBtn} onPress={() => onOpenSettings(image)}>
                        <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>

            {isExpanded && (
                <View style={styles.fileContent}>
                    <View style={[styles.contentWrapper, isNarrow && styles.contentWrapperColumn]}>
                        {/* Thumbnail with Rename */}
                        <View style={styles.thumbnailSection}>
                            <TouchableOpacity style={styles.thumbnail} onPress={onPress}>
                                <ExpoImage
                                    source={imageSource}
                                    style={styles.thumbnailImage}
                                    contentFit="cover"
                                    transition={200}
                                />
                            </TouchableOpacity>
                            <Text style={styles.imageNameText} numberOfLines={1}>{image.original_filename}</Text>
                        </View>

                        {/* Analysis Results */}
                        <View style={styles.analysisResults}>
                            {isAnalyzing ? (
                                <View style={styles.analyzingContainer}>
                                    <ActivityIndicator size="small" color={Colors.primaryDark} />
                                    <Text style={styles.analyzingText}>Analyzing...</Text>
                                </View>
                            ) : analysis ? (
                                <>
                                    {/* Cell Stats */}
                                    <View style={styles.cellStats}>
                                        <View style={styles.statItem}>
                                            <Text style={[styles.statLabel, styles.apoptosisLabel]}>Apoptosis cell</Text>
                                            <Text style={[styles.statValue, styles.apoptosisValue]}>{analysis.apoptosis.toFixed(0)}%</Text>
                                        </View>
                                        <View style={styles.statItem}>
                                            <Text style={[styles.statLabel, styles.normalLabel]}>Normal cell</Text>
                                            <Text style={[styles.statValue, styles.normalValue]}>{analysis.normal.toFixed(0)}%</Text>
                                        </View>
                                        <View style={styles.statItem}>
                                            <Text style={[styles.statLabel, styles.otherLabel]}>Other cell</Text>
                                            <Text style={[styles.statValue, styles.otherValue]}>{analysis.other.toFixed(0)}%</Text>
                                        </View>
                                    </View>

                                    {/* Progress Bar */}
                                    <View style={styles.progressContainer}>
                                        <View style={styles.progressBar}>
                                            <View style={[styles.progressSegment, styles.progressApoptosis, { width: `${analysis.apoptosis}%` }]} />
                                            <View style={[styles.progressSegment, styles.progressNormal, { width: `${analysis.normal}%` }]} />
                                            <View style={[styles.progressSegment, styles.progressOther, { width: `${analysis.other}%` }]} />
                                        </View>
                                    </View>

                                    {/* Total Counts */}
                                    <View style={[styles.totalCounts, isNarrow && styles.totalCountsWrap]}>
                                        <View style={styles.countItem}>
                                            <Text style={styles.countLabel}>Total apoptosis cell</Text>
                                            <Text style={styles.countValue}>{analysis.totalApoptosis}</Text>
                                        </View>
                                        {!isNarrow && <View style={styles.countDivider} />}
                                        <View style={styles.countItem}>
                                            <Text style={styles.countLabel}>Total normal cell</Text>
                                            <Text style={styles.countValue}>{analysis.totalNormal}</Text>
                                        </View>
                                        {!isNarrow && <View style={styles.countDivider} />}
                                        <View style={styles.countItem}>
                                            <Text style={styles.countLabel}>Total other cell</Text>
                                            <Text style={styles.countValue}>{analysis.totalOther}</Text>
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <TouchableOpacity style={styles.analyzeBtn} onPress={() => onAnalyze(image)}>
                                    <Ionicons name="analytics-outline" size={20} color={Colors.white} />
                                    <Text style={styles.analyzeBtnText}>Analyze</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

export default function FolderDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [images, setImages] = useState<Image[]>([]);
    const [folderName, setFolderName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
    const [token, setToken] = useState<string | null>(null);

    // Analysis state
    const [analysisResults, setAnalysisResults] = useState<Map<number, AnalysisResultResponse>>(new Map());
    const [analyzingImages, setAnalyzingImages] = useState<Set<number>>(new Set());

    // Cached image URIs state for offline viewing
    const [cachedImageUris, setCachedImageUris] = useState<Map<number, string>>(new Map());
    const [isOnline, setIsOnline] = useState(networkService.getIsOnline());

    // Fetch token and network status on mount
    React.useEffect(() => {
        authService.getStoredToken().then(setToken);

        // Listen for network changes
        const unsubscribe = networkService.addListener((online) => {
            setIsOnline(online);
        });

        return () => unsubscribe();
    }, []);

    // Settings Modal State
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);

    // Rename Modal State
    const [isRenameVisible, setIsRenameVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);

    // Image Actions State
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);
    const [isImageSettingsVisible, setIsImageSettingsVisible] = useState(false);
    const [isImageRenameVisible, setIsImageRenameVisible] = useState(false);
    const [newImageName, setNewImageName] = useState('');
    const [isRenamingImage, setIsRenamingImage] = useState(false);

    const openImageSettings = (image: Image) => {
        setSelectedImage(image);
        setIsImageSettingsVisible(true);
    };

    const handleRenameImage = async () => {
        if (!selectedImage || !newImageName.trim()) return;

        setIsRenamingImage(true);
        try {
            await imageService.renameImage(selectedImage.image_id, newImageName.trim());
            setIsImageRenameVisible(false);
            setImages(prev => prev.map(img =>
                img.image_id === selectedImage.image_id
                    ? { ...img, original_filename: newImageName.trim() }
                    : img
            ));
            Alert.alert('Success', 'Image renamed successfully');
        } catch (error) {
            console.error('Failed to rename image:', error);
            Alert.alert('Error', 'Failed to rename image');
        } finally {
            setIsRenamingImage(false);
            setNewImageName('');
            setSelectedImage(null);
        }
    };

    const handleDeleteImage = (image: Image) => {
        Alert.alert(
            'Delete Image',
            `Are you sure you want to delete "${image.original_filename}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await imageService.deleteImage(image.image_id);
                            setImages(prev => prev.filter(img => img.image_id !== image.image_id));
                            Alert.alert('Success', 'Image deleted successfully');
                        } catch (error) {
                            console.error('Failed to delete image:', error);
                            Alert.alert('Error', 'Failed to delete image');
                        }
                    },
                },
            ]
        );
    };

    const fetchData = async () => {
        if (!id) return;

        try {
            // Use offline-aware method that falls back to local database
            const imagesRes = await imageService.listImagesWithOfflineFallback(Number(id));

            // Try to get folder name from server or use cached
            try {
                const foldersRes = await folderService.listFolders();
                const folder = foldersRes.folders.find(f => f.folder_id === Number(id));
                if (folder) setFolderName(folder.folder_name);
            } catch (error) {
                console.log('Could not fetch folder name from server');
            }

            setImages(imagesRes.images);

            // Load analysis history and cache images for each image
            for (const img of imagesRes.images) {
                // Load analysis data with offline fallback
                loadAnalysisResult(img.image_id);
                // Cache images in background for offline access
                cacheImageUri(img.image_id);
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // Cache image URI for offline viewing
    const cacheImageUri = async (imageId: number) => {
        try {
            const { uri } = await imageCacheService.getImageUri(imageId, networkService.getIsOnline());
            if (uri) {
                setCachedImageUris(prev => new Map(prev).set(imageId, uri));
            }
        } catch (error) {
            console.error(`Failed to cache image ${imageId}:`, error);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [id])
    );

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchData();
    };

    const handleUploadImage = async () => {
        try {
            // Request permission first
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permissionResult.granted) {
                Alert.alert('Permission Required', 'Please allow access to your photo library to upload images.');
                return;
            }

            console.log('Opening image picker...');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                quality: 0.8,
            });

            console.log('Image picker result:', result);

            if (result.canceled || !result.assets.length) {
                console.log('User cancelled or no assets');
                return;
            }

            setIsUploading(true);

            for (const asset of result.assets) {
                const filename = asset.fileName || `image_${Date.now()}.jpg`;
                console.log('Uploading:', filename, 'to folder:', id);

                // Upload the image
                const uploadedImage = await imageService.uploadImage(Number(id), asset.uri, filename);

                // Add to images list
                setImages(prev => [uploadedImage, ...prev]);

                // Auto-start analysis
                analyzeImageById(uploadedImage.image_id);
            }

            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } catch (error) {
            console.error('Upload failed:', error);
            Alert.alert('Error', 'Failed to upload images');
        } finally {
            setIsUploading(false);
        }
    };

    const loadAnalysisResult = async (imageId: number) => {
        try {
            // Use offline-aware method that automatically falls back to cached results
            const result = await analysisService.getAnalysisResultWithOfflineFallback(imageId);
            if (result) {
                setAnalysisResults(prev => new Map(prev).set(imageId, result));
            }
        } catch (error) {
            console.error('Failed to load analysis result:', error);
        }
    };

    const analyzeImageById = async (imageId: number) => {
        if (analyzingImages.has(imageId)) return;

        setAnalyzingImages(prev => new Set(prev).add(imageId));

        try {
            const response = await analysisService.analyzeImage(imageId);
            const result = await analysisService.waitForJobCompletion(response.job_id);
            setAnalysisResults(prev => new Map(prev).set(imageId, result));

            // Update image has_analysis flag
            setImages(prev => prev.map(img =>
                img.image_id === imageId ? { ...img, has_analysis: true } : img
            ));
        } catch (error) {
            console.error('Analysis failed:', error);
            Alert.alert('Error', 'Failed to analyze image');
        } finally {
            setAnalyzingImages(prev => {
                const next = new Set(prev);
                next.delete(imageId);
                return next;
            });
        }
    };

    const handleAnalyzeImage = (image: Image) => {
        analyzeImageById(image.image_id);
    };

    const toggleExpand = (imageId: number) => {
        setExpandedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(imageId)) {
                newSet.delete(imageId);
            } else {
                newSet.add(imageId);
            }
            return newSet;
        });
    };

    const handleImagePress = (image: Image) => {
        router.push(`/image/${image.image_id}`);
    };

    // Rename Functions
    const openRenameModal = () => {
        setIsSettingsVisible(false);
        setNewFolderName(folderName);
        setIsRenameVisible(true);
    };

    const handleRename = async () => {
        if (!newFolderName.trim()) {
            Alert.alert('Error', 'Folder name cannot be empty');
            return;
        }

        setIsRenaming(true);
        try {
            await folderService.renameFolder(Number(id), newFolderName);
            setFolderName(newFolderName);
            setIsRenameVisible(false);
            Alert.alert('Success', 'Folder renamed successfully');
        } catch (error) {
            console.error('Rename failed:', error);
            Alert.alert('Error', 'Failed to rename folder');
        } finally {
            setIsRenaming(false);
        }
    };

    // Delete Functions
    const handleDeleteConfirm = () => {
        setIsSettingsVisible(false);
        Alert.alert(
            'Delete Folder',
            'Are you sure you want to delete this folder? All images inside will be deleted permanently.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: deleteFolder
                }
            ]
        );
    };

    const deleteFolder = async () => {
        try {
            await folderService.deleteFolder(Number(id));
            router.back();
            // Optional: You could show a toast or message on the dashboard if supported
        } catch (error) {
            console.error('Delete failed:', error);
            Alert.alert('Error', 'Failed to delete folder');
        }
    };

    const filteredImages = images.filter(image =>
        image.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderHeader = () => (
        <View style={styles.headerContent}>
            {/* Breadcrumb and Settings */}
            <View style={styles.breadcrumbRow}>
                <View style={styles.breadcrumb}>
                    <Ionicons name="folder-outline" size={20} color={Colors.textPrimary} />
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.breadcrumbLink}>Dashboard/</Text>
                    </TouchableOpacity>
                    <Text style={styles.breadcrumbCurrent}>{folderName}</Text>
                </View>

                <TouchableOpacity
                    style={styles.settingsBtn}
                    onPress={() => setIsSettingsVisible(true)}
                >
                    <Ionicons name="settings-outline" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Search and Upload */}
            <View style={styles.actionRow}>
                <View style={styles.searchBox}>
                    <Ionicons name="search-outline" size={20} color={Colors.textPlaceholder} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search files..."
                        placeholderTextColor={Colors.textPlaceholder}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        onSubmitEditing={Keyboard.dismiss}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <Ionicons name="filter-outline" size={20} color={Colors.textPlaceholder} />
                </View>
                <TouchableOpacity
                    style={[styles.uploadBtn, (!isOnline || isUploading) && styles.uploadBtnDisabled]}
                    onPress={handleUploadImage}
                    disabled={isUploading || !isOnline}
                >
                    {isUploading ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                    ) : !isOnline ? (
                        <>
                            <Ionicons name="cloud-offline-outline" size={20} color={Colors.white} />
                            <Text style={styles.uploadBtnText}>offline</Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />
                            <Text style={styles.uploadBtnText}>upload</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderTableHeader = () => (
        <View style={styles.tableHeader}>
            <View style={styles.sortIcon}>
                <Ionicons name="caret-up" size={12} color={Colors.white} />
                <Ionicons name="caret-down" size={12} color={Colors.white} style={{ marginTop: -4 }} />
            </View>
            <Text style={styles.headerName}>name</Text>
        </View>
    );

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No images yet</Text>
            <Text style={styles.emptySubtext}>Upload images to analyze</Text>
        </View>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primaryDark} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={styles.container}>
                {renderHeader()}

                {/* File List */}
                <View style={styles.fileList}>
                    {renderTableHeader()}
                    <FlatList
                        data={filteredImages}
                        keyExtractor={(item) => item.image_id.toString()}
                        renderItem={({ item }) => (
                            <FileItem
                                image={item}
                                isExpanded={expandedItems.has(item.image_id)}
                                isAnalyzing={analyzingImages.has(item.image_id)}
                                analysisResult={analysisResults.get(item.image_id) || null}
                                cachedImageUri={cachedImageUris.get(item.image_id) || null}
                                onToggle={() => toggleExpand(item.image_id)}
                                onPress={() => handleImagePress(item)}
                                onOpenSettings={openImageSettings}
                                onDelete={handleDeleteImage}
                                onAnalyze={handleAnalyzeImage}
                                token={token}
                            />
                        )}
                        ListEmptyComponent={renderEmpty}
                        contentContainerStyle={filteredImages.length === 0 ? styles.emptyList : undefined}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor={Colors.primaryDark}
                            />
                        }
                    />
                </View>

                {/* Settings Modal */}
                <Modal
                    visible={isSettingsVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setIsSettingsVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setIsSettingsVisible(false)}
                    >
                        <View style={styles.settingsModalContent}>
                            <TouchableOpacity style={styles.settingsOption} onPress={openRenameModal}>
                                <Ionicons name="pencil-outline" size={20} color={Colors.textPrimary} />
                                <Text style={styles.settingsOptionText}>Rename Folder</Text>
                            </TouchableOpacity>
                            <View style={styles.divider} />
                            <TouchableOpacity
                                style={[styles.settingsOption, styles.deleteOption]}
                                onPress={handleDeleteConfirm}
                            >
                                <Ionicons name="trash-outline" size={20} color={'#FF4444'} />
                                <Text style={[styles.settingsOptionText, styles.deleteText]}>Delete Folder</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {/* Rename Modal */}
                <Modal
                    visible={isRenameVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setIsRenameVisible(false)}
                >
                    <View style={styles.modalCenterOverlay}>
                        <View style={styles.renameModalContent}>
                            <Text style={styles.modalTitle}>Rename Folder</Text>
                            <TextInput
                                style={styles.renameInput}
                                value={newFolderName}
                                onChangeText={setNewFolderName}
                                placeholder="Folder Name"
                                autoFocus
                                selectTextOnFocus
                            />
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.cancelButton]}
                                    onPress={() => setIsRenameVisible(false)}
                                >
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.saveButton]}
                                    onPress={handleRename}
                                    disabled={isRenaming}
                                >
                                    {isRenaming ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Text style={styles.saveButtonText}>Save</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Image Settings Modal */}
                <Modal
                    visible={isImageSettingsVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setIsImageSettingsVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setIsImageSettingsVisible(false)}
                    >
                        <View style={styles.settingsModalContent}>
                            <TouchableOpacity
                                style={styles.settingsOption}
                                onPress={() => {
                                    setIsImageSettingsVisible(false);
                                    if (selectedImage) {
                                        router.push(`/image/${selectedImage.image_id}`);
                                    }
                                }}
                            >
                                <Ionicons name="image-outline" size={20} color={Colors.textPrimary} />
                                <Text style={styles.settingsOptionText}>View Image</Text>
                            </TouchableOpacity>
                            <View style={styles.divider} />
                            <TouchableOpacity
                                style={styles.settingsOption}
                                onPress={() => {
                                    setIsImageSettingsVisible(false);
                                    if (selectedImage) {
                                        setNewImageName(selectedImage.original_filename);
                                        setIsImageRenameVisible(true);
                                    }
                                }}
                            >
                                <Ionicons name="pencil-outline" size={20} color={Colors.textPrimary} />
                                <Text style={styles.settingsOptionText}>Rename Image</Text>
                            </TouchableOpacity>
                            <View style={styles.divider} />
                            <TouchableOpacity
                                style={styles.settingsOption}
                                onPress={() => {
                                    setIsImageSettingsVisible(false);
                                    if (selectedImage) {
                                        handleDeleteImage(selectedImage);
                                    }
                                }}
                            >
                                <Ionicons name="trash-outline" size={20} color={Colors.textPrimary} />
                                <Text style={styles.settingsOptionText}>Delete Image</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {/* Image Rename Modal */}
                <Modal
                    visible={isImageRenameVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setIsImageRenameVisible(false)}
                >
                    <View style={styles.modalCenterOverlay}>
                        <View style={styles.renameModalContent}>
                            <Text style={styles.modalTitle}>Rename Image</Text>
                            <TextInput
                                style={styles.renameInput}
                                value={newImageName}
                                onChangeText={setNewImageName}
                                placeholder="Image Name"
                                autoFocus
                                selectTextOnFocus
                            />
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.cancelButton]}
                                    onPress={() => setIsImageRenameVisible(false)}
                                >
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.saveButton]}
                                    onPress={handleRenameImage}
                                    disabled={isRenamingImage}
                                >
                                    {isRenamingImage ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Text style={styles.saveButtonText}>Save</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
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
    headerContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    breadcrumbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    breadcrumb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    breadcrumbLink: {
        fontSize: 16,
        color: Colors.textPrimary,
    },
    breadcrumbCurrent: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    settingsBtn: {
        padding: 4,
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    searchBox: {
        flex: 1,
        minWidth: 200,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.primaryDark,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: Colors.textPrimary,
        minWidth: 50,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.primaryDark,
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexShrink: 0,
    },
    uploadBtnDisabled: {
        backgroundColor: '#9CA3AF',
        opacity: 0.8,
    },
    uploadBtnText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.white,
    },
    fileList: {
        flex: 1,
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: '#8A929A',
        borderRadius: 16,
        overflow: 'hidden',
    },
    tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primaryDark,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    sortIcon: {
        marginRight: 8,
    },
    headerName: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.white,
    },
    fileItem: {
        borderBottomWidth: 1,
        borderBottomColor: '#8A929A',
    },
    fileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    fileHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    fileName: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.textPrimary,
        flex: 1,
    },
    fileHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.primaryDark,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        color: Colors.white,
    },
    actionIcon: {
        padding: 4,
    },
    settingsIconBtn: {
        padding: 8,
    },
    fileContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    contentWrapper: {
        flexDirection: 'row',
        gap: 20,
    },
    contentWrapperColumn: {
        flexDirection: 'column',
        gap: 16,
    },
    thumbnailSection: {
        alignItems: 'center',
        gap: 8,
    },
    thumbnail: {
        width: 140,
        height: 100,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
    },
    thumbnailPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#E3E3E3',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    imageNameText: {
        fontSize: 11,
        color: Colors.textSecondary,
        textAlign: 'center',
        maxWidth: 140,
    },
    renameBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    renameBtnText: {
        fontSize: 12,
        color: Colors.primaryDark,
        fontWeight: '500',
    },
    analysisResults: {
        flex: 1,
    },
    cellStats: {
        flexDirection: 'row',
        gap: 30,
        marginBottom: 16,
    },
    statItem: {
        flexDirection: 'column',
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '500',
        marginBottom: 4,
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
    statValue: {
        fontSize: 20,
        fontWeight: '600',
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
    progressNormal: {
        backgroundColor: Colors.normal,
    },
    progressOther: {
        backgroundColor: '#A3A9B0',
    },
    totalCounts: {
        flexDirection: 'row',
        gap: 16,
        alignItems: 'center',
    },
    totalCountsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
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
    countDivider: {
        width: 2,
        height: 20,
        backgroundColor: '#B4B4B4',
    },
    imageActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    imageActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.primaryDark,
    },
    imageActionBtnDelete: {
        borderColor: '#FF4444',
    },
    imageActionText: {
        fontSize: 13,
        fontWeight: '500',
        color: Colors.primaryDark,
    },
    imageActionTextDelete: {
        color: '#FF4444',
    },
    analyzingPlaceholder: {
        flex: 1,
        gap: 12,
    },
    placeholderRow: {
        flexDirection: 'row',
        gap: 16,
    },
    placeholderBar: {
        height: 20,
        backgroundColor: '#B4B4B4',
        borderRadius: 4,
    },
    w1: { width: 60 },
    w2: { width: 50 },
    w3: { width: 70 },
    w4: { width: 40 },
    w5: { width: 80 },
    w6: { width: 55 },
    actionButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 80,
    },
    primaryFunctionBtn: {
        backgroundColor: Colors.secondary, // Or a distinct color for "Open"
    },
    actionButtonIcon: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: Colors.background, // Light background for 3-dot
        marginLeft: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    emptyList: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 8,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    settingsModalContent: {
        backgroundColor: Colors.surface || '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        position: 'absolute',
        top: 100, // Adjust based on your header height
        right: 20,
        width: 200,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    settingsOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
    },
    settingsOptionText: {
        fontSize: 16,
        color: Colors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: '#E0E0E0',
    },
    deleteOption: {

    },
    deleteText: {
        color: '#FF4444',
    },
    modalCenterOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    renameModalContent: {
        backgroundColor: Colors.surface || '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 20,
        textAlign: 'center',
    },
    renameInput: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#F0F0F0',
    },
    saveButton: {
        backgroundColor: Colors.primaryDark,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: Colors.white,
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
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    analyzeBtnText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.white,
    },
});
