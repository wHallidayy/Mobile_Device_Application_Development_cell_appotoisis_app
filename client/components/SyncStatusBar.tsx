import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { syncService } from '@/services/syncService';
import { networkService } from '@/services/networkService';

const THEME_COLOR = '#383837';
const THEME_BG_LIGHT = 'rgba(56, 56, 55, 0.08)'; 

type SyncState = 'online' | 'offline' | 'syncing' | 'error';

interface SyncStatusBarProps {
  compact?: boolean;
}

export default function SyncStatusBar({ compact = false }: SyncStatusBarProps) {
  const [syncState, setSyncState] = useState<SyncState>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [spinAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    syncService.start();
    updateState();
    
    const syncUnsubscribe = syncService.addListener((status) => {
      if (status === 'syncing') {
        setSyncState('syncing');
        startSpinAnimation();
      } else if (status === 'error') {
        setSyncState('error');
      } else {
        updateState();
      }
    });

    const networkUnsubscribe = networkService.addListener((isOnline) => {
      if (!isOnline) {
        setSyncState('offline');
      } else {
        updateState();
      }
    });

    return () => {
      syncUnsubscribe();
      networkUnsubscribe();
    };
  }, []);

  const updateState = async () => {
    const isOnline = networkService.getIsOnline();
    const pending = await syncService.getPendingCount();
    setPendingCount(pending);

    if (!isOnline) {
      setSyncState('offline');
    } else if (pending > 0) {
      setSyncState('syncing');
    } else {
      setSyncState('online');
    }
  };

  const startSpinAnimation = () => {
    spinAnim.setValue(0);
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    ).start();
  };

  const handleSyncPress = () => {
    syncService.syncAll();
  };

  const handleRetryPress = () => {
    syncService.retryFailed();
  };

  // --- ปรับ Config ให้ใช้สี #383837 เท่านั้น ---
  const getConfig = () => {
    switch (syncState) {
      case 'offline':
        return {
          icon: 'cloud-offline-outline' as const,
          text: 'Offline',
          // ใช้พื้นหลังจางๆ เพื่อให้ดูเป็นปุ่ม แต่ยังคุมโทนสีเดิม
          bgColor: THEME_BG_LIGHT, 
        };
      case 'syncing':
        return {
          icon: 'sync-outline' as const,
          text: pendingCount > 0 ? `Syncing ${pendingCount}...` : 'Syncing...',
          bgColor: THEME_BG_LIGHT,
        };
      case 'error':
        return {
          icon: 'alert-circle-outline' as const,
          text: 'Sync failed',
          bgColor: THEME_BG_LIGHT,
        };
      default: // Online / Synced
        return {
          icon: 'cloud-done-outline' as const,
          text: 'Synced',
          // ปกติสถานะพร้อมใช้งานมักจะพื้นหลังใส เพื่อความคลีน
          bgColor: 'transparent', 
        };
    }
  };

  const config = getConfig();
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // สไตล์ร่วมกัน
  const commonIconColor = THEME_COLOR;
  const commonTextColor = THEME_COLOR;

  if (compact) {
    return (
      <TouchableOpacity
        style={[
            styles.compactContainer, 
            { backgroundColor: config.bgColor, borderColor: THEME_COLOR, borderWidth: 1 }
        ]}
        onPress={syncState === 'error' ? handleRetryPress : handleSyncPress}
      >
        {syncState === 'syncing' ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name={config.icon} size={18} color={commonIconColor} />
          </Animated.View>
        ) : (
          <Ionicons name={config.icon} size={18} color={commonIconColor} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.container, 
        { 
            backgroundColor: config.bgColor,
            // เพิ่ม border บางๆ สีเดียวกัน (Opacity ต่ำๆ) เพื่อให้ขอบชัดขึ้น
            borderColor: 'rgba(56, 56, 55, 0.2)',
            borderWidth: 1,
        }
      ]}
      onPress={syncState === 'error' ? handleRetryPress : handleSyncPress}
      activeOpacity={0.7}
    >
      {syncState === 'syncing' ? (
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Ionicons name={config.icon} size={16} color={commonIconColor} />
        </Animated.View>
      ) : (
        <Ionicons name={config.icon} size={16} color={commonIconColor} />
      )}
      
      <Text style={[styles.text, { color: commonTextColor }]}>
        {config.text}
      </Text>
      
      {syncState === 'error' && (
        <Text style={[styles.retryText, { color: commonTextColor }]}>
          Tap to retry
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  compactContainer: {
    padding: 8,
    borderRadius: 20,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  retryText: {
    fontSize: 11,
    marginLeft: 4,
    opacity: 0.7,
    textDecorationLine: 'underline',
  },
});