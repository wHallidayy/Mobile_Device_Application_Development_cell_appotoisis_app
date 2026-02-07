import React, { useState, useEffect, useCallback } from 'react';
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
  Keyboard,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/config';
import { useAuth } from '@/contexts/AuthContext';
import { folderService, Folder } from '@/services/folderService';
import FolderCard from '@/components/FolderCard';
import CreateFolderModal from '@/components/CreateFolderModal';
import SyncStatusBar from '@/components/SyncStatusBar';

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchFolders = async () => {
    try {
      console.log('Fetching folders...');
      const response = await folderService.listFolders();
      console.log('Folders response:', JSON.stringify(response, null, 2));
      setFolders(response.folders);
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFolders();
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchFolders();
  };

  const handleCreateFolder = async (name: string) => {
    await folderService.createFolder(name);
    fetchFolders();
  };

  const handleFolderPress = (folder: Folder) => {
    router.push(`/folder/${folder.folder_id}`);
  };

  const filteredFolders = folders.filter(folder =>
    folder.folder_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Breadcrumb with Sync Status */}
      <View style={styles.breadcrumbRow}>
        <View style={styles.breadcrumb}>
          <Ionicons name="folder-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.breadcrumbText}>Dashboard</Text>
        </View>
        <SyncStatusBar compact />
      </View>

      {/* Search and New Folder */}
      <View style={styles.actionRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={Colors.textPlaceholder} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search folders..."
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
          style={styles.newFolderBtn}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="folder-outline" size={20} color={Colors.white} />
          <Text style={styles.newFolderText}>new folder</Text>
        </TouchableOpacity>
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>folder</Text>
      </View>
    </View>
  );

  const renderFolder = ({ item, index }: { item: Folder; index: number }) => (
    <View style={styles.folderItem}>
      <FolderCard
        name={item.folder_name}
        onPress={() => handleFolderPress(item)}
      />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={64} color={Colors.textMuted} />
      <Text style={styles.emptyText}>No folders yet</Text>
      <Text style={styles.emptySubtext}>Create a folder to get started</Text>
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
    <SafeAreaView style={styles.container}>
      {/* Content */}
      <FlatList
        data={filteredFolders}
        keyExtractor={(item) => item.folder_id.toString()}
        renderItem={renderFolder}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={renderEmpty()}
        numColumns={2}
        columnWrapperStyle={styles.folderGrid}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primaryDark}
          />
        }
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateFolder}
      />
    </SafeAreaView>
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
  listContent: {
    paddingBottom: 24,
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
  breadcrumbText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  searchBox: {
    flex: 1,
    minWidth: 200, // Ensure it doesn't get too small before wrapping
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
    minWidth: 50, // Prevent input from collapsing
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexShrink: 0,
  },
  newFolderText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  folderGrid: {
    paddingHorizontal: 20,
    gap: 20,
  },
  folderItem: {
    flex: 1,
    maxWidth: '50%',
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
});
